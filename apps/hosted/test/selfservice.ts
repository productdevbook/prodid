import { sha256Hex, type TxtRecord } from '@prodid/core'

import { createApp, type Services } from '../src/app'
import type { TxtLookup } from '../src/dns'
import { formToken, randomToken } from '../src/signin'
import { MemoryBlobs } from './blobs'
import { memorySql } from './sql'

export const OPERATOR = 'publish.prodid.org'
export const ORIGIN = `https://${OPERATOR}`
export const TOKEN = 'operator-secret'

export interface World {
	services: Services
	blobs: MemoryBlobs
	sql: ReturnType<typeof memorySql>
	txt: Map<string, TxtRecord[] | 'servfail'>
	lookups: string[]
	pinged: string[][]
	clock: { now: Date }
}

export function world(): World {
	const blobs = new MemoryBlobs()
	const sql = memorySql()
	const txt = new Map<string, TxtRecord[] | 'servfail'>()
	const lookups: string[] = []
	const pinged: string[][] = []
	const clock = { now: new Date('2026-10-28T12:00:00.000Z') }
	const services: Services = {
		blobs,
		accounts: sql,
		async resolveTxt(name): Promise<TxtLookup> {
			lookups.push(name)
			const records = txt.get(name)
			if (records === 'servfail') return { ok: false, reason: 'servfail' }
			return { ok: true, records: records ?? [] }
		},
		async ping(domains) {
			pinged.push(domains)
		},
		now: () => clock.now,
		zone: 'prodid.org',
		operatorHost: OPERATOR,
		operatorToken: TOKEN,
		mail: {
			async send() {
				throw new Error('no mail expected')
			},
		},
		turnstile: {
			siteKey: 'site-key',
			async verify() {
				return false
			},
		},
	}
	return { services, blobs, sql, txt, lookups, pinged, clock }
}

export function caller(w: World) {
	return (path: string, init: RequestInit = {}, host = OPERATOR): Promise<Response> => {
		const headers = new Headers(init.headers)
		headers.set('host', host)
		return Promise.resolve(createApp(() => w.services).fetch(new Request(`https://${host}${path}`, { ...init, headers })))
	}
}

export interface Browser {
	accountId: string
	email: string
	cookie: string
	form: string
}

/** A signed-in browser, made straight in the database: signing in itself is tested elsewhere. */
export async function signedIn(w: World, email: string): Promise<Browser> {
	const at = w.clock.now.toISOString()
	await w.sql.run('insert or ignore into account (id, email, created_at) values (?, ?, ?)', `id-${email}`, email, at)
	const account = await w.sql.first<{ id: string }>('select id from account where email = ?', email)
	if (account === null) throw new Error('no account')
	const session = randomToken()
	await w.sql.run(
		'insert into session (hash, account_id, created_at, expires_at) values (?, ?, ?, ?)',
		await sha256Hex(session),
		account.id,
		at,
		'2099-01-01T00:00:00.000Z',
	)
	return { accountId: account.id, email, cookie: `__Host-session=${session}`, form: await formToken(session) }
}

export function post(
	call: ReturnType<typeof caller>,
	browser: Browser,
	path: string,
	fields: Record<string, string | Blob>,
	origin = ORIGIN,
): Promise<Response> {
	const body = new FormData()
	body.set('form', browser.form)
	for (const [name, value] of Object.entries(fields)) body.set(name, value)
	return call(path, { method: 'POST', headers: { cookie: browser.cookie, origin }, body })
}

export function createSite(
	call: ReturnType<typeof caller>,
	browser: Browser,
	slug: string,
	fields: Record<string, string> = {},
): Promise<Response> {
	return post(call, browser, '/sites', {
		slug,
		name: 'Acme Tekstil',
		contact: browser.email,
		license: 'CC0-1.0',
		other: '',
		...fields,
	})
}

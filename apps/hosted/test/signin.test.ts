import { beforeEach, describe, expect, test } from 'bun:test'

import { sha256Hex } from '@prodid/core'

import { createApp, type Services } from '../src/app'
import { addressPrefix } from '../src/signin'
import type { Sql } from '../src/sql'
import { memorySql } from './sql'

const OPERATOR = 'publish.prodid.org'
const ORIGIN = `https://${OPERATOR}`
const PASS = 'turnstile-pass'
const SESSION_ATTRIBUTES = 'Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax'

let sql: Sql & { database: import('bun:sqlite').Database }
let clock: Date
let sent: { to: string; subject: string; text: string }[]
let mailFails: boolean
let turnstileChecks: { response: string; address: string | undefined }[]
let services: Services

beforeEach(() => {
	sql = memorySql()
	clock = new Date('2026-10-28T12:00:00.000Z')
	sent = []
	mailFails = false
	turnstileChecks = []
	services = {
		blobs: {
			get: async () => null,
			text: async () => null,
			put: async () => {},
			delete: async () => {},
			slugs: async () => [],
		},
		accounts: sql,
		resolveTxt: async () => ({ ok: true, records: [] }),
		ping: async () => {},
		now: () => clock,
		zone: 'prodid.org',
		operatorHost: OPERATOR,
		operatorToken: 'operator-secret',
		mail: {
			async send(to, subject, text) {
				if (mailFails) throw new Error('mail down')
				sent.push({ to, subject, text })
			},
		},
		turnstile: {
			siteKey: 'site-key',
			async verify(response, address) {
				turnstileChecks.push({ response, address })
				return response === PASS
			},
		},
	}
})

function call(path: string, init: RequestInit = {}, host = OPERATOR): Promise<Response> {
	const headers = new Headers(init.headers)
	headers.set('host', host)
	return Promise.resolve(createApp(() => services).fetch(new Request(`https://${host}${path}`, { ...init, headers })))
}

function cookieValue(response: Response, name: string): string | undefined {
	for (const line of response.headers.getSetCookie()) {
		if (line.startsWith(`${name}=`)) return line.slice(name.length + 1).split(';')[0]
	}
	return undefined
}

function formField(html: string): string {
	const match = /name="form" value="([0-9a-f]{64})"/.exec(html)
	if (match?.[1] === undefined) throw new Error('no form token on the page')
	return match[1]
}

/** A browser at the start page: the cookie it was given and the token its form carries. */
async function visitStart(): Promise<{ cookie: string; form: string }> {
	const response = await call('/')
	expect(response.status).toBe(200)
	const value = cookieValue(response, '__Host-form')
	if (value === undefined) throw new Error('no form cookie')
	return { cookie: `__Host-form=${value}`, form: formField(await response.text()) }
}

function askForLink(
	browser: { cookie: string; form: string },
	fields: Record<string, string>,
	headers: Record<string, string> = {},
): Promise<Response> {
	return call('/signin', {
		method: 'POST',
		headers: { origin: ORIGIN, cookie: browser.cookie, 'cf-connecting-ip': '203.0.113.7', ...headers },
		body: new URLSearchParams({ form: browser.form, 'cf-turnstile-response': PASS, ...fields }),
	})
}

function mailedToken(): string {
	const match = /https:\/\/publish\.prodid\.org\/signin\/([A-Za-z0-9_-]+)/.exec(sent.at(-1)?.text ?? '')
	if (match?.[1] === undefined) throw new Error('no link in the mail')
	return match[1]
}

async function signIn(email = 'maker@example.com'): Promise<string> {
	const response = await askForLink(await visitStart(), { email })
	expect(response.status).toBe(200)
	const landing = await call(`/signin/${mailedToken()}`)
	expect(landing.status).toBe(303)
	const session = cookieValue(landing, '__Host-session')
	if (session === undefined) throw new Error('no session cookie')
	return `__Host-session=${session}`
}

describe('start page', () => {
	test('shows the form with Turnstile and sets a form cookie', async () => {
		const response = await call('/')
		const html = await response.text()
		expect(response.headers.get('content-type')).toContain('text/html')
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(html).toContain('Send sign-in link')
		expect(html).toContain('data-sitekey="site-key"')
		expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js')
		expect(response.headers.getSetCookie().find((line) => line.startsWith('__Host-form='))).toEndWith(
			'; Path=/; Secure; HttpOnly; SameSite=Lax',
		)
	})

	test('is not served on a site host', async () => {
		expect((await call('/', {}, 'acme.prodid.org')).status).toBe(404)
	})
})

describe('sign-in link', () => {
	test('is mailed, stored only as its hash, and signs in once', async () => {
		const browser = await visitStart()
		const response = await askForLink(browser, { email: ' Maker@Example.com ' })
		expect(response.status).toBe(200)
		const page = await response.text()
		expect(page).toContain('Check your inbox')
		expect(page).toContain('maker@example.com')
		expect(sent).toHaveLength(1)
		expect(sent[0]?.to).toBe('maker@example.com')
		expect(turnstileChecks).toEqual([{ response: PASS, address: '203.0.113.7' }])

		const token = mailedToken()
		const stored = await sql.all<{ hash: string; account_email: string; expires_at: string }>('select * from login_token')
		expect(stored).toEqual([
			expect.objectContaining({ hash: await sha256Hex(token), account_email: 'maker@example.com', expires_at: '2026-10-28T12:15:00.000Z' }),
		])
		expect(JSON.stringify(sql.database.query('select * from login_token').all())).not.toContain(token)
		expect(await sql.first('select * from account')).toBeNull()

		const landing = await call(`/signin/${token}`)
		expect(landing.status).toBe(303)
		expect(landing.headers.get('location')).toBe('/sites')
		const session = landing.headers.getSetCookie().find((line) => line.startsWith('__Host-session='))
		expect(session).toMatch(new RegExp(`^__Host-session=[A-Za-z0-9_-]{43}; ${SESSION_ATTRIBUTES}$`))
		const value = cookieValue(landing, '__Host-session') ?? ''
		expect(await sql.first<{ hash: string; expires_at: string }>('select hash, expires_at from session')).toEqual({
			hash: await sha256Hex(value),
			expires_at: '2026-11-27T12:00:00.000Z',
		})

		const sites = await call('/sites', { headers: { cookie: `__Host-session=${value}` } })
		expect(sites.status).toBe(200)
		expect(await sites.text()).toContain('maker@example.com')
	})

	test('a reused link shows the expired state and signs nobody in', async () => {
		await askForLink(await visitStart(), { email: 'maker@example.com' })
		const token = mailedToken()
		expect((await call(`/signin/${token}`)).status).toBe(303)
		const again = await call(`/signin/${token}`)
		expect(again.status).toBe(410)
		expect(cookieValue(again, '__Host-session')).toBeUndefined()
		const html = await again.text()
		expect(html).toContain('This link has expired')
		expect(html).toContain('Send sign-in link')
		expect(await sql.all('select * from session')).toHaveLength(1)
	})

	test('an expired link shows the expired state', async () => {
		await askForLink(await visitStart(), { email: 'maker@example.com' })
		const token = mailedToken()
		clock = new Date('2026-10-28T12:15:00.000Z')
		const response = await call(`/signin/${token}`)
		expect(response.status).toBe(410)
		expect(await response.text()).toContain('This link has expired')
		expect(await sql.first('select * from account')).toBeNull()
	})

	test('an unknown link shows the expired state', async () => {
		const response = await call('/signin/not-a-token')
		expect(response.status).toBe(410)
		expect(await response.text()).toContain('This link has expired')
	})

	test('signing in twice keeps one account', async () => {
		await signIn()
		clock = new Date('2026-10-29T08:00:00.000Z')
		await signIn()
		expect(await sql.all('select email, created_at, last_sign_in_at from account')).toEqual([
			{ email: 'maker@example.com', created_at: '2026-10-28T12:00:00.000Z', last_sign_in_at: '2026-10-29T08:00:00.000Z' },
		])
		expect(await sql.all('select * from session')).toHaveLength(2)
	})

	test('a session ends after 30 days', async () => {
		const cookie = await signIn()
		clock = new Date('2026-11-27T12:00:00.000Z')
		const response = await call('/sites', { headers: { cookie } })
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/')
	})
})

describe('limits', () => {
	test('five links per email per hour', async () => {
		const browser = await visitStart()
		for (let index = 0; index < 5; index++) {
			expect((await askForLink(browser, { email: 'maker@example.com' }, { 'cf-connecting-ip': `198.51.100.${index}` })).status).toBe(200)
		}
		const refused = await askForLink(browser, { email: 'maker@example.com' }, { 'cf-connecting-ip': '198.51.100.9' })
		expect(refused.status).toBe(429)
		expect(await refused.text()).toContain('Too many sign-in links')
		expect(sent).toHaveLength(5)

		clock = new Date('2026-10-28T12:59:59.000Z')
		expect((await askForLink(browser, { email: 'maker@example.com' })).status).toBe(429)
		clock = new Date('2026-10-28T13:00:00.000Z')
		expect((await askForLink(browser, { email: 'maker@example.com' })).status).toBe(200)
	})

	test('twenty links per client address per hour, IPv6 counted by its /64', async () => {
		const browser = await visitStart()
		for (let index = 0; index < 20; index++) {
			const address = `2001:db8:1:2::${index.toString(16)}`
			expect((await askForLink(browser, { email: `maker${index}@example.com` }, { 'cf-connecting-ip': address })).status).toBe(200)
		}
		const refused = await askForLink(browser, { email: 'other@example.com' }, { 'cf-connecting-ip': '2001:0db8:0001:0002:ffff::1' })
		expect(refused.status).toBe(429)
		expect((await askForLink(browser, { email: 'other@example.com' }, { 'cf-connecting-ip': '2001:db8:1:3::1' })).status).toBe(200)
	})

	test('prefixes', () => {
		expect(addressPrefix('203.0.113.7')).toBe('203.0.113.7')
		expect(addressPrefix('2001:db8:1:2::5')).toBe('2001:db8:1:2::/64')
		expect(addressPrefix('2001:0DB8:0001:0002:0:0:0:5')).toBe('2001:db8:1:2::/64')
		expect(addressPrefix('2001:db8::1')).toBe('2001:db8:0:0::/64')
		expect(addressPrefix('::ffff:192.0.2.1')).toBe('0:0:0:0::/64')
	})
})

describe('refused requests', () => {
	test('a request without a Turnstile response sends nothing', async () => {
		const browser = await visitStart()
		const response = await call('/signin', {
			method: 'POST',
			headers: { origin: ORIGIN, cookie: browser.cookie },
			body: new URLSearchParams({ form: browser.form, email: 'maker@example.com' }),
		})
		expect(response.status).toBe(400)
		expect(await response.text()).toContain('The check did not pass')
		expect(turnstileChecks).toEqual([])
		expect(sent).toEqual([])
		expect(await sql.all('select * from login_token')).toEqual([])
	})

	test('a failed Turnstile response sends nothing', async () => {
		const response = await askForLink(await visitStart(), { email: 'maker@example.com', 'cf-turnstile-response': 'bot' })
		expect(response.status).toBe(400)
		expect(sent).toEqual([])
	})

	test('a cross-origin POST is refused', async () => {
		const browser = await visitStart()
		for (const origin of ['https://evil.example', 'http://publish.prodid.org', 'https://acme.prodid.org', null]) {
			const headers: Record<string, string> = { cookie: browser.cookie }
			if (origin !== null) headers['origin'] = origin
			const response = await call('/signin', {
				method: 'POST',
				headers,
				body: new URLSearchParams({ form: browser.form, email: 'maker@example.com', 'cf-turnstile-response': PASS }),
			})
			expect(response.status).toBe(403)
		}
		expect(sent).toEqual([])
	})

	test('a POST without the form token, or with another browser’s, is refused', async () => {
		const browser = await visitStart()
		const other = await visitStart()
		expect((await askForLink(browser, { email: 'maker@example.com', form: '' })).status).toBe(403)
		expect((await askForLink({ cookie: browser.cookie, form: other.form }, { email: 'maker@example.com' })).status).toBe(403)
		expect((await askForLink({ cookie: '', form: browser.form }, { email: 'maker@example.com' })).status).toBe(403)
		expect(sent).toEqual([])
	})

	test('a malformed email is refused before Turnstile is asked', async () => {
		const response = await askForLink(await visitStart(), { email: 'not an address' })
		expect(response.status).toBe(400)
		expect(await response.text()).toContain('That is not an email address')
		expect(turnstileChecks).toEqual([])
	})

	test('a mail failure says so', async () => {
		mailFails = true
		const response = await askForLink(await visitStart(), { email: 'maker@example.com' })
		expect(response.status).toBe(502)
		expect(await response.text()).toContain('The mail could not be sent')
	})
})

describe('session', () => {
	test('your sites needs a session', async () => {
		const response = await call('/sites')
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/')
	})

	test('a signed-in visitor at the start goes to their sites', async () => {
		const cookie = await signIn()
		const response = await call('/', { headers: { cookie } })
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/sites')
	})

	test('sign out needs the session’s form token and the origin, then ends the session', async () => {
		const cookie = await signIn()
		const form = formField(await (await call('/sites', { headers: { cookie } })).text())
		const signOut = (headers: Record<string, string>, token: string) =>
			call('/signout', { method: 'POST', headers: { cookie, ...headers }, body: new URLSearchParams({ form: token }) })

		expect((await signOut({ origin: 'https://evil.example' }, form)).status).toBe(403)
		expect((await signOut({ origin: ORIGIN }, 'f'.repeat(64))).status).toBe(403)
		const response = await signOut({ origin: ORIGIN }, form)
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/')
		expect(response.headers.getSetCookie()).toContain(`__Host-session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`)
		expect(await sql.all('select * from session')).toEqual([])
		expect((await call('/sites', { headers: { cookie } })).status).toBe(303)
	})
})

describe('operator endpoint beside the pages', () => {
	test('still needs the token', async () => {
		expect((await call('/sites/acme', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
		expect((await call('/', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
		expect((await call('/sites', { headers: { authorization: 'Bearer operator-secret' } })).status).toBe(404)
	})
})

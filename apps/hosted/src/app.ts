import { isNotModified, problem, sha256Hex } from '@prodid/core'
import { type Context, Hono } from 'hono'

import type { IndexView } from './crawl'
import type { TxtLookup } from './dns'
import { checkFeed, MAX_FEED_BYTES } from './feeds'
import { checkSlug, isFeedName, resolveHost, siteHost, type Target } from './names'
import { releaseSite } from './owners'
import { SELF_SERVICE, selfService } from './selfservice'
import {
	type Blobs,
	deleteSite,
	documentEtag,
	feedKey,
	parseSiteInput,
	readSite,
	removeFeed,
	type Site,
	siteDocument,
	storeFeed,
	writeSite,
} from './sites'
import type { Sql } from './sql'
import { verifySite, type VerifyOutcome } from './verify'

/** A document can list at most this many feeds; the crawler rejects one listing more, whole. */
export const MAX_FEEDS = 100

export interface Services {
	blobs: Blobs
	accounts: Sql
	resolveTxt(name: string): Promise<TxtLookup>
	/** Asks the index for a crawl through its public ping, like any other publisher. */
	ping(domains: string[]): Promise<void>
	/** Reads the index's public status of a name, like any other publisher. */
	indexView(name: string): Promise<IndexView>
	now(): Date
	zone: string
	operatorHost: string
	/** Unset means the operator endpoint answers nobody. */
	operatorToken: string | undefined
	mail: Mailer
	turnstile: Turnstile
}

export interface Mailer {
	send(to: string, subject: string, text: string): Promise<void>
}

export interface Turnstile {
	siteKey: string
	/** Asks Cloudflare whether the widget's response is a pass; `address` is the client's, when known. */
	verify(response: string, address: string | undefined): Promise<boolean>
}

export type App = { Variables: { services: Services; target: Target | { kind: 'self-service' } } }

const DOCUMENT_CACHE = 'public, max-age=60'
const FEED_CACHE = 'public, max-age=60'

export function createApp(build: (env: Env) => Services): Hono<App> {
	const app = new Hono<App>()
	const pages = selfService(build)
	app.notFound(() => notFound())

	app.use('*', async (c, next) => {
		const services = build(c.env as Env)
		const target = resolveHost(c.req.header('host') ?? null, services.zone, services.operatorHost)
		if (target.kind === 'none') return notFound()
		if (target.kind === 'operator' && c.req.header('authorization') === undefined && SELF_SERVICE.test(c.req.path)) {
			return pages.fetch(c.req.raw, c.env, lifetimeOf(c))
		}
		if (target.kind === 'operator' && !(await authorized(c.req.header('authorization'), services.operatorToken))) {
			return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer', 'cache-control': 'no-store' } })
		}
		c.set('services', services)
		c.set('target', target)
		await next()
	})

	app.use('/sites/*', async (c, next) => {
		if (c.get('target').kind !== 'operator') return notFound()
		await next()
	})

	app.get('/.well-known/prodid.json', async (c) => {
		const target = c.get('target')
		if (target.kind !== 'site') return notFound()
		const services = c.get('services')
		const site = await readSite(services.blobs, target.slug)
		const document = site === null ? null : siteDocument(site, services.zone)
		if (site === null || document === null) return notFound()

		const etag = await documentEtag(document)
		const lastModified = new Date(site.updatedAt)
		const headers = new Headers({
			'content-type': 'application/json; charset=utf-8',
			'cache-control': DOCUMENT_CACHE,
			etag,
			'last-modified': lastModified.toUTCString(),
		})
		if (isNotModified(conditional(c), { etag, lastModified })) return new Response(null, { status: 304, headers })
		return new Response(`${JSON.stringify(document)}\n`, { headers })
	})

	app.get('/feeds/:name', async (c) => {
		const target = c.get('target')
		const name = c.req.param('name')
		if (target.kind !== 'site' || !isFeedName(name)) return notFound()
		const services = c.get('services')
		const site = await readSite(services.blobs, target.slug)
		if (site === null || !site.feeds.includes(name)) return notFound()
		const object = await services.blobs.get(feedKey(site.slug, name))
		if (object === null) return notFound()

		const headers = new Headers({
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': FEED_CACHE,
			etag: object.etag,
			'last-modified': object.uploaded.toUTCString(),
		})
		if (isNotModified(conditional(c), { etag: object.etag, lastModified: object.uploaded })) {
			await object.body.cancel()
			return new Response(null, { status: 304, headers })
		}
		headers.set('content-length', String(object.size))
		return new Response(object.body, { headers })
	})

	app.get('/sites/:slug', async (c) => {
		const site = await operatorSite(c)
		if (site === null) return operatorError(404, 'no such site')
		return siteAnswer(c, site, 200)
	})

	app.put('/sites/:slug', async (c) => {
		const services = c.get('services')
		const slug = c.req.param('slug')
		const allowed = checkSlug(slug)
		if (!allowed.ok) return operatorError(400, `slug refused: ${allowed.reason}`)

		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return operatorError(400, 'body is not JSON')
		}
		const parsed = parseSiteInput(body, services.zone)
		if (!parsed.ok) return operatorError(400, parsed.detail)

		const existing = await readSite(services.blobs, slug)
		const now = services.now().toISOString()
		const site: Site = {
			slug,
			...(existing?.owner === undefined ? {} : { owner: existing.owner }),
			publisher: parsed.input.publisher,
			license: parsed.input.license,
			feeds: existing?.feeds ?? [],
			updatedAt: now,
		}
		if (parsed.input.domain !== undefined) site.domain = parsed.input.domain
		if (existing?.verified !== undefined && existing.verified === site.domain) {
			site.verified = existing.verified
			if (existing.verifiedAt !== undefined) site.verifiedAt = existing.verifiedAt
		}
		await writeSite(services.blobs, site)
		announce(c, site)
		return siteAnswer(c, site, existing === null ? 201 : 200)
	})

	app.delete('/sites/:slug', async (c) => {
		const site = await operatorSite(c)
		if (site === null) return operatorError(404, 'no such site')
		const services = c.get('services')
		await deleteSite(services.blobs, site)
		await releaseSite(services.accounts, site.slug, services.now())
		announce(c, site)
		return new Response(null, { status: 204 })
	})

	app.put('/sites/:slug/feeds/:name', async (c) => {
		const site = await operatorSite(c)
		if (site === null) return operatorError(404, 'no such site')
		const name = c.req.param('name')
		if (!isFeedName(name)) return operatorError(400, 'feed name must be lowercase letters, digits and hyphens ending in .ndjson')
		if (!site.feeds.includes(name) && site.feeds.length >= MAX_FEEDS) return operatorError(409, `a site lists at most ${MAX_FEEDS} feeds`)

		const declared = Number(c.req.header('content-length') ?? Number.NaN)
		if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) return operatorError(413, `a feed is at most ${MAX_FEED_BYTES} bytes`)
		const bytes = await readCapped(c.req.raw.body, MAX_FEED_BYTES)
		if (bytes === null) return operatorError(413, `a feed is at most ${MAX_FEED_BYTES} bytes`)

		const checked = await checkFeed(bytes)
		if (!checked.ok) return Response.json({ error: 'feed refused', problems: checked.problems }, { status: 400 })

		const services = c.get('services')
		const updated = await storeFeed(services.blobs, site, name, bytes, checked.items, services.now())
		announce(c, updated)
		return Response.json({ feed: name, items: checked.items, url: `https://${siteHost(site.slug, services.zone)}/feeds/${name}` })
	})

	app.delete('/sites/:slug/feeds/:name', async (c) => {
		const site = await operatorSite(c)
		if (site === null) return operatorError(404, 'no such site')
		const name = c.req.param('name')
		if (!site.feeds.includes(name)) return operatorError(404, 'no such feed')
		const services = c.get('services')
		const updated = await removeFeed(services.blobs, site, name, services.now())
		announce(c, updated)
		return new Response(null, { status: 204 })
	})

	app.post('/sites/:slug/verify', async (c) => {
		const site = await operatorSite(c)
		if (site === null) return operatorError(404, 'no such site')
		const services = c.get('services')
		const { site: checked, outcome } = await reverify(services, site)
		if (checked !== site) announce(c, checked)
		return Response.json({ outcome, site: checked, document: siteDocument(checked, services.zone) })
	})

	app.all('*', () => notFound())

	return app
}

/**
 * Re-reads every claimed domain's record, so a domain that withdraws its delegation stops being
 * named by the document: one naming a domain that no longer delegates here speaks for nobody, and
 * the slug would stop being discoverable even as itself.
 */
export async function reverifyAll(services: Services): Promise<string[]> {
	const changed: string[] = []
	for (const slug of await services.blobs.slugs()) {
		const site = await readSite(services.blobs, slug)
		if (site?.domain === undefined) continue
		const { site: checked } = await reverify(services, site)
		if (checked === site) continue
		changed.push(...announced(checked, services.zone))
	}
	if (changed.length > 0) await services.ping(changed)
	return changed
}

export async function reverify(
	services: Services,
	site: Site,
	lookup: (name: string) => Promise<TxtLookup> = (name) => services.resolveTxt(name),
): Promise<{ site: Site; outcome: VerifyOutcome }> {
	const result = await verifySite(site, services.zone, lookup, services.now())
	if (result.site.verified === site.verified) return { site, outcome: result.outcome }
	const updated = { ...result.site, updatedAt: services.now().toISOString() }
	await writeSite(services.blobs, updated)
	return { site: updated, outcome: result.outcome }
}

async function operatorSite(c: Context<App>): Promise<Site | null> {
	const slug = c.req.param('slug')
	if (slug === undefined || !checkSlug(slug).ok) return null
	return readSite(c.get('services').blobs, slug)
}

function siteAnswer(c: Context<App>, site: Site, status: number): Response {
	const zone = c.get('services').zone
	return Response.json({ site, host: siteHost(site.slug, zone), document: siteDocument(site, zone) }, { status })
}

/** The slug host, and the domain it claims: a change to either is something the index should crawl for. */
function announced(site: Site, zone: string): string[] {
	const names = [siteHost(site.slug, zone)]
	if (site.domain !== undefined) names.push(site.domain)
	return names
}

export function announce(c: Context<App>, site: Site): void {
	const services = c.get('services')
	const pinging = services.ping(announced(site, services.zone)).catch((error: unknown) => {
		console.error('ping failed', site.slug, error)
	})
	const lifetime = lifetimeOf(c)
	if (lifetime === undefined) void pinging
	else lifetime.waitUntil(pinging)
}

function lifetimeOf(c: Context<App>): Context<App>['executionCtx'] | undefined {
	try {
		return c.executionCtx
	} catch {
		return undefined
	}
}

function conditional(c: Context<App>): { ifNoneMatch: string | null; ifModifiedSince: string | null } {
	return { ifNoneMatch: c.req.header('if-none-match') ?? null, ifModifiedSince: c.req.header('if-modified-since') ?? null }
}

function notFound(): Response {
	const document = problem('not-found')
	return new Response(`${JSON.stringify(document.body)}\n`, { status: document.status, headers: document.headers })
}

function operatorError(status: number, error: string): Response {
	return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
}

/** Digests first, so the comparison takes the same time whatever the two strings share. */
async function authorized(header: string | undefined, token: string | undefined): Promise<boolean> {
	if (token === undefined || token === '' || header === undefined) return false
	const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
	const [left, right] = await Promise.all([sha256Hex(presented), sha256Hex(token)])
	let difference = 0
	for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
	return difference === 0
}

async function readCapped(body: ReadableStream<Uint8Array> | null, cap: number): Promise<Uint8Array<ArrayBuffer> | null> {
	if (body === null) return new Uint8Array()
	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		total += value.byteLength
		if (total > cap) {
			await reader.cancel()
			return null
		}
		chunks.push(value)
	}
	const bytes = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return bytes
}

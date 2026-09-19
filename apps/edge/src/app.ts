import { isOpid, MAX_PING_DOMAINS, parseGtin, parsePingRequest } from '@prodid/core'
import entitySchema from '@prodid/spec/schemas/org.prodid.entity.json'
import feedSchema from '@prodid/spec/schemas/org.prodid.feed.json'
import itemSchema from '@prodid/spec/schemas/org.prodid.item.json'
import sourceSchema from '@prodid/spec/schemas/org.prodid.source.json'
import { findMedia, readEntity, readEntityByGtin, readSourceStatus } from '@prodid/store'
import { type Context, Hono } from 'hono'

import { problemResponse, respond } from './http'
import { callerKey } from './limits/policy'
import { mediaKey } from './media/store'
import { IMMUTABLE } from './media/store'
import { renderEntity, renderSource } from './render'
import type { Lifetime, Services } from './services'

export type ServicesFactory = (env: Env) => Services

type App = { Bindings: Env; Variables: { services: Services } }

/** Resolver answers are safe to cache briefly: a merge or a withdrawal is visible within the minute. */
const RESOLVER_CACHE = 'public, max-age=60, stale-while-revalidate=300'
const SOURCE_CACHE = 'public, max-age=60'
const SCHEMA_CACHE = 'public, max-age=3600'

// A Map, not an object: `/schemas/v0/__proto__` and `/constructor` are paths a stranger can ask for,
// and a plain property lookup answers both of them with something.
const SCHEMAS = new Map<string, unknown>([
	['org.prodid.entity.json', entitySchema],
	['org.prodid.feed.json', feedSchema],
	['org.prodid.item.json', itemSchema],
	['org.prodid.source.json', sourceSchema],
])

function executionContext(c: Context<App>): Lifetime | undefined {
	try {
		return c.executionCtx
	} catch {
		return undefined
	}
}

/** The response is already built here, so closing the pool is work for after it has been sent. */
function release(services: Services, ctx: Lifetime | undefined): void {
	if (services.close === undefined) return
	const closing = services.close().catch(() => {})
	if (ctx === undefined) void closing
	else ctx.waitUntil(closing)
}

export function createApp(build: ServicesFactory): Hono<App> {
	const app = new Hono<App>()

	app.use('*', async (c, next) => {
		const services = build(c.env)
		c.set('services', services)
		try {
			await next()
		} finally {
			release(services, executionContext(c))
		}
	})

	app.get('/id/:opid', async (c) => {
		const opid = c.req.param('opid')
		if (!isOpid(opid)) return problemResponse(c.req.raw, 'unknown-opid')
		const history = c.req.query('history') === '1'
		const found = await readEntity(c.get('services').sql, opid, { history })
		if (!found.found) return problemResponse(c.req.raw, 'unknown-opid')
		if (found.merged) {
			// Per request, not permanent in practice: a merge is reversible, so the redirect is cached
			// for as long as any other resolver answer and no longer.
			return new Response(null, {
				status: 308,
				headers: {
					location: `/id/${found.survivor}${history ? '?history=1' : ''}`,
					'cache-control': RESOLVER_CACHE,
					vary: 'Accept',
				},
			})
		}
		return await respond(c.req.raw, found.entity, () => renderEntity(found.entity), { cacheControl: RESOLVER_CACHE })
	})

	// Further GS1 Digital Link segments (/10/{lot}, /21/{serial}) are accepted and ignored.
	const gtinHandler = async (c: Context<App>): Promise<Response> => {
		const written = c.req.param('gtin') ?? ''
		const gtin = parseGtin(written)
		if (!gtin.ok) return problemResponse(c.req.raw, 'invalid-gtin', gtin.problem)
		if (gtin.restricted) return problemResponse(c.req.raw, 'restricted-gtin')
		const history = c.req.query('history') === '1'
		const found = await readEntityByGtin(c.get('services').sql, gtin.value, { history })
		if (!found.found) return problemResponse(c.req.raw, 'unknown-gtin')
		return await respond(c.req.raw, found.entity, () => renderEntity(found.entity), {
			cacheControl: RESOLVER_CACHE,
			headers: { 'content-location': `/id/${found.opid}` },
		})
	}
	app.get('/01/:gtin', gtinHandler)
	app.get('/01/:gtin/*', gtinHandler)

	app.get('/source/:name', async (c) => {
		const name = c.req.param('name')
		const sql = c.get('services').sql
		const status = (await readSourceStatus(sql, name)) ?? (await readSourceStatus(sql, name.toLowerCase()))
		if (status === null) return problemResponse(c.req.raw, 'unknown-source')
		return await respond(c.req.raw, status, () => renderSource(status), { cacheControl: SOURCE_CACHE })
	})

	app.get('/schemas/v0/:file', async (c) => {
		const schema = SCHEMAS.get(c.req.param('file'))
		if (schema === undefined) return problemResponse(c.req.raw, 'not-found')
		return new Response(`${JSON.stringify(schema, null, '\t')}\n`, {
			headers: { 'content-type': 'application/schema+json; charset=utf-8', 'cache-control': SCHEMA_CACHE },
		})
	})

	/**
	 * `media.prodid.org`. This is a Worker route rather than a bare R2 custom domain because a
	 * bucket can serve a stored content type and cache metadata but cannot answer `410` with a
	 * problem body for a hash on the takedown list, and cannot add the content security policy that
	 * keeps anything served from here from being a page.
	 */
	app.get('/sha256/:hex', async (c) => {
		const hex = c.req.param('hex')
		if (!/^[0-9a-f]{64}$/.test(hex)) return problemResponse(c.req.raw, 'not-found')
		const services = c.get('services')

		const known = await findMedia(services.sql, hex)
		if (known?.blocked_at != null) return problemResponse(c.req.raw, 'blocked-media')

		const object = await services.media.get(mediaKey(hex))
		if (object === null) return problemResponse(c.req.raw, 'not-found')

		const contentType = object.contentType ?? known?.content_type ?? 'application/octet-stream'
		const headers = new Headers({
			'content-type': contentType,
			'content-length': String(object.size),
			'cache-control': IMMUTABLE,
			etag: object.etag,
			'x-content-type-options': 'nosniff',
			// Nothing served from here is a page: no script, no fetch, no same-origin anything.
			'content-security-policy': "default-src 'none'; sandbox",
			'access-control-allow-origin': '*',
		})
		// A document is downloaded, never rendered in place.
		if (contentType === 'application/pdf') headers.set('content-disposition', 'attachment')
		if (c.req.header('if-none-match') === object.etag) {
			await object.body.cancel().catch(() => {})
			return new Response(null, { status: 304, headers })
		}
		return new Response(object.body, { headers })
	})

	app.post('/ping', async (c) => {
		const services = c.get('services')
		const now = services.now()

		// The caller's budget is spent before the body is read, so a malformed request costs the same
		// as a valid one and nothing in the answer depends on anything but the caller.
		const caller = callerKey(c.req.header('cf-connecting-ip') ?? null)
		const allowed = await services.limits.caller(caller, now)
		if (!allowed.ok) {
			return problemResponse(c.req.raw, 'rate-limited', undefined, {
				'retry-after': String(Math.ceil(allowed.retryAfterMs / 1000)),
			})
		}

		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return problemResponse(c.req.raw, 'invalid-request', 'body is not JSON')
		}
		const parsed = parsePingRequest(body)
		if (!parsed.ok) return problemResponse(c.req.raw, 'invalid-request', parsed.reason)
		if (parsed.domains.length > MAX_PING_DOMAINS) return problemResponse(c.req.raw, 'invalid-request', 'too-many-domains')

		await services.queue.sendBatch(parsed.domains.map((domain) => ({ kind: 'discover' as const, domain })))

		// 202 is the whole vocabulary: it says nothing about whether the domain is known, whether a
		// crawl is already scheduled, or what any of it found.
		return new Response(`${JSON.stringify({ status: 'accepted' })}\n`, {
			status: 202,
			headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
		})
	})

	app.notFound((c) => problemResponse(c.req.raw, 'not-found'))

	app.onError((error) => {
		console.error(error)
		return new Response(`${JSON.stringify({ type: 'about:blank', title: 'Internal error', status: 500 })}\n`, {
			status: 500,
			headers: { 'content-type': 'application/problem+json; charset=utf-8', 'cache-control': 'no-store' },
		})
	})

	return app
}

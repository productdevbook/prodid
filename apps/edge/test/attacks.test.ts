import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import type { CrawlStatus, SourceRecord } from '@prodid/core'
import { databaseReachable } from '@prodid/store/testing'

import { POLICY } from '../src/limits/policy'
import { dripBody } from './support/fakes'
import { document, GTINS, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001
const DAY = 86_400_000

async function sourceCount(name: string): Promise<number> {
	const rows = await edge!.sql<{ count: string }[]>`select count(*)::text as count from source where name = ${name}`
	return Number(rows[0]?.count ?? 0)
}

type Status = Omit<SourceRecord, 'last_crawl'> & { last_crawl?: CrawlStatus & { feeds_failed?: number } }

async function status(name: string): Promise<Status> {
	const response = await edge!.fetch(`/source/${name}`)
	expect(response.status).toBe(200)
	return await json<Status>(response)
}

describe.skipIf(!reachable)('discovery refuses what does not speak for the domain', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a delegated document with no domain field is rejected: absence is never consent', async () => {
		edge!.net.setTxt('_prodid.acme.example', ['v=prodid0; host=host.example'])
		edge!.net.document('host.example', document({ feeds: ['https://host.example/items.ndjson'] }))
		edge!.net.feed('https://host.example/items.ndjson', [JACKET.navy])

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored' })
		expect(await sourceCount('acme.example')).toBe(0)
		expect(edge!.net.fetched).not.toContain('https://host.example/items.ndjson')
	})

	test('a document naming someone else speaks for nobody', async () => {
		edge!.net.document('acme.example', document({ domain: 'victim.example', feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored' })
		expect(await sourceCount('acme.example')).toBe(0)
		expect(await sourceCount('victim.example')).toBe(0)
	})

	test('two v=prodid0 records are an error, not a choice', async () => {
		edge!.net.setTxt('_prodid.acme.example', ['v=prodid0; host=one.example', 'v=prodid0; host=two.example'])
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored', reason: 'multiple-records' })
		expect(edge!.net.fetched).toHaveLength(0)
	})

	test('a malformed record ends discovery and never falls through to .well-known', async () => {
		edge!.net.setTxt('_prodid.acme.example', ['v=prodid0'])
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored', reason: 'missing-host' })
		expect(edge!.net.fetched).toHaveLength(0)
	})

	test('a document listing a feed on another host is rejected whole', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://cdn.example/items.ndjson'] }))
		edge!.net.feed('https://cdn.example/items.ndjson', [JACKET.navy])

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored' })
		expect(edge!.net.fetched).not.toContain('https://cdn.example/items.ndjson')
	})

	test('a redirect off the host is not followed', async () => {
		edge!.net.serve('https://acme.example/.well-known/prodid.json', {
			status: 302,
			headers: { location: 'https://evil.example/.well-known/prodid.json' },
		})
		edge!.net.document('evil.example', document({ domain: 'acme.example', feeds: ['https://evil.example/items.ndjson'] }))

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored' })
		expect(edge!.net.fetched).not.toContain('https://evil.example/.well-known/prodid.json')
	})

	test('a 200 serving an HTML fallback page is not an answer', async () => {
		edge!.net.serve('https://acme.example/.well-known/prodid.json', {
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8' },
			body: '<!doctype html><title>Not found</title>',
		})

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored' })
		expect(await sourceCount('acme.example')).toBe(0)
	})
})

describe.skipIf(!reachable)('the crawler never reaches a private network', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	for (const address of ['169.254.169.254', '10.0.0.1', '::ffff:10.0.0.1', '127.0.0.1', 'fd00::1']) {
		test(`a name resolving only to ${address} is not fetched`, async () => {
			edge!.net.setAddresses('acme.example', [address])
			edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))

			expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'ignored' })
			expect(edge!.net.fetched).toHaveLength(0)
		})
	}

	test('a name with one public address among private ones is still fetched', async () => {
		edge!.net.setAddresses('acme.example', ['10.0.0.1', '93.184.216.34'])
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
	})
})

describe.skipIf(!reachable)('caps', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
		edge!.services.caps.documentBytes = 1_048_576
		edge!.services.caps.documentMs = 30_000
	})

	test('an oversized document is a transport failure, not a negative', async () => {
		edge!.services.caps.documentBytes = 256
		edge!.net.serve('https://acme.example/.well-known/prodid.json', {
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ $type: 'org.prodid.feed', padding: 'x'.repeat(4096) }),
		})

		// Nothing is stored about a domain that has never published, so the source is asked for first.
		await edge!.sql`insert into source (kind, name) values ('domain', 'acme.example')`
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'fetch-failed' })
		const after = await status('acme.example')
		expect(after.last_crawl?.outcome).toBe('transport-failure')
		expect(after.lapsed).toBe(false)
	})

	test('a body that drips forever is stopped by the deadline', async () => {
		edge!.services.caps.documentMs = 120
		edge!.net.serve('https://acme.example/.well-known/prodid.json', {
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: dripBody(40),
		})

		await edge!.sql`insert into source (kind, name) values ('domain', 'acme.example')`
		const started = Date.now()
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'fetch-failed' })
		expect(Date.now() - started).toBeLessThan(5_000)
	})
})

describe.skipIf(!reachable)('lapse', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('503 forever lapses on day seven, not before', async () => {
		// One good crawl first: a domain that never published is never a source at all.
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
		expect((await status('acme.example')).lapsed).toBe(false)

		// The seven days run from the first failure, so day seven of failing is the eighth crawl.
		edge!.net.serve('https://acme.example/.well-known/prodid.json', { status: 503 })
		for (let day = 0; day <= 6; day += 1) {
			edge!.clock.advance(DAY)
			expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'fetch-failed' })
			const daily = await status('acme.example')
			expect(daily.lapsed).toBe(false)
			expect(daily.last_crawl?.outcome).toBe('transport-failure')
			expect(daily.last_crawl?.http_status).toBe(503)
		}

		edge!.clock.advance(DAY)
		await edge!.crawl('acme.example')
		const lapsed = await status('acme.example')
		expect(lapsed.lapsed).toBe(true)
		expect(lapsed.trust).toBe('verified')

		// The claims stay readable and stay marked while the source is lapsed.
		const entity = await json<{ claims: { source: { lapsed: boolean } }[] }>(await edge!.fetch(`/01/${GTINS.navy}`))
		expect(entity.claims.length).toBeGreaterThan(0)
		for (const claim of entity.claims) expect(claim.source.lapsed).toBe(true)

		// Thirty days after the lapse the sweep withdraws what is left.
		edge!.clock.advance(31 * DAY)
		const { lapseSweep } = await import('@prodid/store')
		await lapseSweep(edge!.sql, { now: edge!.clock.now() })
		const swept = await json<{ claims: unknown[] }>(await edge!.fetch(`/01/${GTINS.navy}`))
		expect(swept.claims).toHaveLength(0)
	})

	test('a healthy document in front of a feed that always fails never reports success and lapses on day seven', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.serve('https://acme.example/items.ndjson', { status: 500 })

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'fetch-failed' })
		const first = await status('acme.example')
		expect(first.last_crawl?.outcome).toBe('transport-failure')
		expect(first.last_crawl?.feeds_failed).toBe(1)
		expect(first.lapsed).toBe(false)

		for (let day = 1; day <= 6; day += 1) {
			edge!.clock.advance(DAY)
			await edge!.crawl('acme.example')
			expect((await status('acme.example')).lapsed).toBe(false)
		}
		edge!.clock.advance(DAY)
		await edge!.crawl('acme.example')
		const after = await status('acme.example')
		expect(after.lapsed).toBe(true)
		expect(after.last_crawl?.outcome).toBe('transport-failure')
	})

	test('a definite negative lapses at once, and a later success clears it', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.serve('https://acme.example/.well-known/prodid.json', { status: 404 })
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'rejected' })
		const negative = await status('acme.example')
		expect(negative.lapsed).toBe(true)
		expect(negative.last_crawl?.outcome).toBe('definite-negative')

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		await edge!.crawl('acme.example')
		expect((await status('acme.example')).lapsed).toBe(false)
	})
})

describe.skipIf(!reachable)('the status page is not an oracle', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a throwaway domain pointed at a host of the caller’s choosing leaves nothing behind', async () => {
		edge!.net.setTxt('_prodid.evil.example', ['v=prodid0; host=victim.example'])
		edge!.net.serve('https://victim.example/.well-known/prodid.json', {
			status: 418,
			headers: { 'content-type': 'text/plain' },
			body: 'go away',
		})

		expect((await edge!.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain: 'evil.example' }) })).status).toBe(202)
		await edge!.drain()

		const asked = await edge!.fetch('/source/evil.example')
		const neverPinged = await edge!.fetch('/source/nobody.example')
		expect(asked.status).toBe(404)
		expect(await asked.text()).toBe(await neverPinged.text())
		expect(await sourceCount('evil.example')).toBe(0)
		expect(await sourceCount('victim.example')).toBe(0)
	})

	test('the http status of a host the source is not verified at is never published', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])
		await edge!.crawl('acme.example')

		// The domain now delegates elsewhere, and that host answers with something telling.
		edge!.clock.advance(TEN_MINUTES)
		edge!.net.setTxt('_prodid.acme.example', ['v=prodid0; host=victim.example'])
		edge!.net.serve('https://victim.example/.well-known/prodid.json', { status: 401, headers: { 'content-type': 'text/html' } })
		await edge!.crawl('acme.example')

		const after = await status('acme.example')
		expect(after.last_crawl?.outcome).toBe('definite-negative')
		expect(after.last_crawl?.http_status).toBeUndefined()
		expect(after.last_crawl?.document_url).toBeUndefined()
	})
})

describe.skipIf(!reachable)('ping and the rate limits', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a thousand domains in one request are accepted, a thousand and one are not', async () => {
		const domains = Array.from({ length: 1000 }, (_unused, index) => `shop${index}.example`)
		const accepted = await edge!.fetch('/ping', { method: 'POST', body: JSON.stringify({ domains }) })
		expect(accepted.status).toBe(202)
		expect(edge!.queue.sent).toHaveLength(1000)

		const tooMany = await edge!.fetch('/ping', {
			method: 'POST',
			body: JSON.stringify({ domains: [...domains, 'one.more.example'] }),
		})
		expect(tooMany.status).toBe(400)
		expect(await json<object>(tooMany)).toMatchObject({ type: 'https://prodid.org/problem/invalid-request' })
	})

	test('a second ping inside the domain window answers 202 and does nothing', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])

		await edge!.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain: 'acme.example' }) })
		await edge!.drain()
		const crawlsAfterFirst = await edge!.sql<{ count: string }[]>`select count(*)::text as count from crawl`

		edge!.clock.advance(60_000)
		const second = await edge!.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain: 'acme.example' }) })
		expect(second.status).toBe(202)
		expect(await json<{ status: string }>(second)).toEqual({ status: 'accepted' })
		await edge!.drain(1)

		const crawlsAfterSecond = await edge!.sql<{ count: string }[]>`select count(*)::text as count from crawl`
		expect(crawlsAfterSecond[0]?.count).toBe(crawlsAfterFirst[0]!.count)
		// Deferred, not dropped: the message comes back when the window opens.
		expect(edge!.queue.pending.length).toBeGreaterThan(0)
	})

	test('a caller over its budget gets 429 with a Retry-After, whatever it asks for', async () => {
		for (let attempt = 0; attempt < POLICY.caller.limit; attempt += 1) {
			await edge!.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain: 'acme.example' }) })
		}
		const blocked = await edge!.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain: 'acme.example' }) })
		expect(blocked.status).toBe(429)
		expect(blocked.headers.get('retry-after')).not.toBeNull()
		expect(await json<object>(blocked)).toMatchObject({ type: 'https://prodid.org/problem/rate-limited' })

		// A malformed body costs the same as a valid one, so nothing in the answer depends on it.
		const malformed = await edge!.fetch('/ping', { method: 'POST', body: 'not json' })
		expect(malformed.status).toBe(429)
	})

	test('subdomains of one registrable domain share the first-contact budget', async () => {
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < POLICY.registrable.limit; attempt += 1) {
			await edge!.limits.firstContact('evil.example', now)
		}

		edge!.net.document('a.evil.example', document({ feeds: ['https://a.evil.example/items.ndjson'] }))
		edge!.net.feed('https://a.evil.example/items.ndjson', [JACKET.navy])
		const deferred = await edge!.crawl('a.evil.example')
		expect(deferred.kind).toBe('deferred')
		expect(edge!.net.fetched).toHaveLength(0)

		// Another registrable domain has its own budget and is untouched.
		edge!.net.document('good.example', document({ feeds: ['https://good.example/items.ndjson'] }))
		edge!.net.feed('https://good.example/items.ndjson', [JACKET.navy])
		expect(await edge!.crawl('good.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
	})

	test('a fetch held back by the per-host budget is deferred, never a failure', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < 20; attempt += 1) await edge!.limits.hostFetch('acme.example', false, now)

		const deferred = await edge!.crawl('acme.example')
		expect(deferred).toMatchObject({ kind: 'deferred' })
		expect(await sourceCount('acme.example')).toBe(0)
		const crawls = await edge!.sql<{ count: string }[]>`select count(*)::text as count from crawl`
		expect(crawls[0]?.count).toBe('0')
	})
})

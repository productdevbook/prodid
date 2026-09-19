import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import type { EntityRecord } from '@prodid/core'
import { lapseSweep, QUEUE_LEASE_MS } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { consumeCrawl } from '../src/consumer'
import { POLICY } from '../src/limits/policy'
import { document, GTINS, item, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001
const DAY = 86_400_000
const FEED_A = 'https://acme.example/a.ndjson'
const FEED_B = 'https://acme.example/b.ndjson'

async function live(): Promise<number> {
	const rows = await edge!.sql<{ count: string }[]>`select count(*)::text as count from record where withdrawn_at is null`
	return Number(rows[0]?.count ?? 0)
}

async function activeClaims(): Promise<number> {
	const rows = await edge!.sql<{ count: string }[]>`select count(*)::text as count from claim where withdrawn_at is null`
	return Number(rows[0]?.count ?? 0)
}

describe.skipIf(!reachable)('review round eight', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	// 1 — after the thirty-day withdrawal a publisher serving unchanged bytes never recovered:
	// validators survived the outage, both fetches answered 304, and the catalogue stayed gone.
	test('a source with nothing live is read unconditionally and recovers from unchanged bytes', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }), { etag: 'd1' })
		edge!.net.feed(FEED_A, [JACKET.navy, JACKET.black], { etag: 'a1' })
		await edge!.crawl('acme.example')
		expect(await live()).toBe(2)

		// Thirty days lapsed: records and claims go together, and the ETags stay.
		await edge!.sql`update source set lapsed_at = ${new Date(edge!.clock.now().getTime() - 31 * DAY)} where name = 'acme.example'`
		await lapseSweep(edge!.sql, { now: edge!.clock.now() })
		expect(await live()).toBe(0)
		expect(await activeClaims()).toBe(0)

		// The publisher has changed nothing at all. Three rounds, as review ran them.
		for (let round = 0; round < 3; round += 1) {
			edge!.clock.advance(TEN_MINUTES)
			await edge!.crawl('acme.example')
			edge!.clock.advance(TEN_MINUTES)
			await edge!.drain()
		}

		expect(await live()).toBe(2)
		expect(await activeClaims()).toBeGreaterThan(0)
		const status = await json<{ lapsed: boolean }>(await edge!.fetch('/source/acme.example'))
		expect(status.lapsed).toBe(false)
		// The gap is visible: what was withdrawn is still there, and the new claims are new.
		const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}?history=1`))
		expect(entity.claims.filter((claim) => claim.withdrawn_at !== undefined).length).toBeGreaterThan(0)
	})

	// 2 — a feed dropped from the document was never retired: its records stayed live forever, or
	// the dead URL was fetched and failed the crawl, chosen by whether an ETag matched.
	test('a feed the document stops listing is retired and its records withdrawn, and it is never fetched again', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A, FEED_B] }))
		edge!.net.feed(FEED_A, [JACKET.navy])
		edge!.net.feed(FEED_B, [JACKET.black])
		await edge!.crawl('acme.example')
		expect(await live()).toBe(2)

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }))
		// The dead URL now fails if anybody asks for it.
		edge!.net.serve(FEED_B, { status: 500 })
		const fetchedBefore = edge!.net.fetched.filter((url) => url === FEED_B).length

		const result = await edge!.crawl('acme.example')
		expect(result).toMatchObject({ kind: 'done', outcome: 'changed' })

		// Retired, not failed: the crawl is a success and the source has not lapsed.
		const status = await json<{ lapsed: boolean; last_crawl: { outcome: string; feeds_failed: number } }>(
			await edge!.fetch('/source/acme.example'),
		)
		expect(status.last_crawl.outcome).toBe('success')
		expect(status.last_crawl.feeds_failed).toBe(0)
		expect(status.lapsed).toBe(false)
		expect(edge!.net.fetched.filter((url) => url === FEED_B).length).toBe(fetchedBefore)

		expect(await live()).toBe(1)
		expect((await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.black}`))).claims).toHaveLength(0)
		const rows = await edge!.sql<{ retired: boolean }[]>`
			select retired_at is not null as retired from feed where url = ${FEED_B}
		`
		expect(rows[0]?.retired).toBe(true)
	})

	test('listing a retired feed again takes it back', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A, FEED_B] }))
		edge!.net.feed(FEED_A, [JACKET.navy])
		edge!.net.feed(FEED_B, [JACKET.black])
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }))
		await edge!.crawl('acme.example')
		expect(await live()).toBe(1)

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.document('acme.example', document({ feeds: [FEED_A, FEED_B] }))
		edge!.net.feed(FEED_B, [JACKET.black])
		await edge!.crawl('acme.example')

		expect(await live()).toBe(2)
		const rows = await edge!.sql<{ retired: boolean }[]>`
			select retired_at is not null as retired from feed where url = ${FEED_B}
		`
		expect(rows[0]?.retired).toBe(false)
	})

	// 3 — a late feed message wrote records against a crawl the stale sweep had already closed.
	test('a feed message that outlived its crawl writes nothing', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }))
		edge!.net.feed(FEED_A, [JACKET.navy])
		await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		const feedMessage = edge!.queue.ready()[0]!

		// The sweep closes the crawl while the message is still in flight.
		const { finalizeStaleCrawls } = await import('@prodid/store')
		edge!.clock.advance(QUEUE_LEASE_MS + 1)
		expect(await finalizeStaleCrawls(edge!.sql, { now: edge!.clock.now(), olderThanMs: QUEUE_LEASE_MS })).toBe(1)

		expect(await consumeCrawl(edge!.services, feedMessage)).toMatchObject({ kind: 'ignored' })
		expect(await live()).toBe(0)
		expect(edge!.queue.pending).toHaveLength(0)
		const crawls = await edge!.sql<{ count: string }[]>`select count(*)::text as count from crawl`
		expect(crawls[0]?.count).toBe('1')
	})

	test('the queue lease is comfortably longer than the longest deferral', () => {
		expect(QUEUE_LEASE_MS).toBeGreaterThan(POLICY.maxDeferralSeconds * 1000 * 2)
	})

	// 6 — `probe` was a snapshot from discovery, so a source lapsed mid-chain kept being written to.
	test('a source lapsed after discovery stops being written to for the rest of the chain', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A, FEED_B] }))
		edge!.net.feed(FEED_A, [JACKET.navy])
		edge!.net.feed(FEED_B, [JACKET.black])

		await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		// The first feed runs normally.
		await consumeCrawl(edge!.services, edge!.queue.ready()[0]!)
		expect(await live()).toBe(1)

		// The sweep lapses the source between two messages of one chain.
		await edge!.sql`update source set lapsed_at = ${edge!.clock.now()} where name = 'acme.example'`
		await consumeCrawl(edge!.services, edge!.queue.ready()[0]!)

		// The second feed was read and proved readable, but nothing of it was written.
		expect(await live()).toBe(1)
		expect((await edge!.fetch(`/01/${GTINS.black}`)).status).toBe(404)
	})

	// 4 — one feed message used to carry two full deadlines.
	test('a feed read is bounded by one deadline, headers and body together', async () => {
		edge!.services.caps.feedMs = 150
		edge!.services.caps.firstByteMs = 50
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }))
		const { dripBody } = await import('./support/fakes')
		edge!.net.serve(FEED_A, { status: 200, headers: { 'content-type': 'application/x-ndjson' }, body: dripBody(40) })
		// The source is verified first so the failure is a transport failure, not a negative.
		await edge!.sql`insert into source (kind, name) values ('domain', 'acme.example')`

		const started = Date.now()
		await edge!.crawl('acme.example')
		expect(Date.now() - started).toBeLessThan(3_000)
		edge!.services.caps.feedMs = 600_000
		edge!.services.caps.firstByteMs = 10_000
	})
})

describe.skipIf(!reachable)('unconditional reads', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a healthy source with live records still gets its 304s', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }), { etag: 'd1' })
		edge!.net.feed(FEED_A, [item({ key: 'k', gtin: GTINS.navy })], { etag: 'a1' })
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'unchanged' })
		const status = await json<{ last_crawl: { http_status: number } }>(await edge!.fetch('/source/acme.example'))
		expect(status.last_crawl.http_status).toBe(304)
	})
})

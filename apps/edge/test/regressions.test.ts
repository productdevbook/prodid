import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import type { EntityRecord } from '@prodid/core'
import { claimDueSources, ingestRecord, lapseSweep, prepareRecord, QUEUE_LEASE_MS } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { consumeCrawl, consumeDeadLetter } from '../src/consumer'
import { runFinalize } from '../src/crawl/run'
import { POLICY } from '../src/limits/policy'
import { claimDueSources as enqueueDue } from '../src/schedule'
import type { CrawlMessage, CrawlPlan, Services } from '../src/services'
import { document, GTINS, item, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001
const DAY = 86_400_000
const FEED = 'https://acme.example/items.ndjson'

function serveAcme(lines: readonly unknown[] = [JACKET.navy]): void {
	edge!.net.document('acme.example', document({ feeds: [FEED] }))
	edge!.net.feed(FEED, lines)
}

describe.skipIf(!reachable)('review round seven', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	// 4 — a record whose identifiers all normalize away minted a fresh entity on every crawl.
	test('a record with no identifier that survives normalization never mints anything', async () => {
		const rows = await edge!.sql<{ id: string }[]>`
			insert into source (kind, name) values ('domain', 'acme.example') returning id::text
		`
		const source = rows[0]!.id
		const blank = { ...item({ key: 'blank' }), identifiers: [{ scheme: 'sku', value: '   ' }] }

		const prepared = await prepareRecord(blank as never, source)
		expect(prepared.ok).toBe(false)

		// And the store refuses even if a caller gets past that.
		const derived = await prepareRecord(item({ key: 'blank', sku: 'S-1' }), source)
		if (!derived.ok) throw new Error(derived.error)
		const broken = { ...derived.prepared, identifiers: [] }
		expect(() => ingestRecord(edge!.sql, { source, record: broken, now: edge!.clock.now() })).toThrow(
			'no identifier that survives normalization',
		)

		const entities = await edge!.sql<{ count: string }[]>`select count(*)::text as count from entity`
		expect(entities[0]?.count).toBe('0')
	})

	// 5 — a lapsed source kept ingesting, and after the 30-day withdrawal every crawl re-inserted
	// what the sweep re-withdrew.
	test('a lapsed source writes nothing until a crawl has succeeded in full', async () => {
		serveAcme()
		await edge!.crawl('acme.example')
		const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))

		// Lapse it, and give it a second record to ingest if it were allowed to.
		await edge!.sql`update source set lapsed_at = ${edge!.clock.now()} where name = 'acme.example'`
		edge!.clock.advance(TEN_MINUTES)
		serveAcme([JACKET.navy, JACKET.black])
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'unchanged' })

		// Nothing was written by the recovering crawl, but the lapse is cleared and a fresh crawl asked for.
		expect((await edge!.fetch(`/01/${GTINS.black}`)).status).toBe(404)
		const cleared = await edge!.sql<{ lapsed_at: Date | null }[]>`select lapsed_at from source where name = 'acme.example'`
		expect(cleared[0]?.lapsed_at).toBeNull()
		expect(edge!.queue.pending.some((entry) => entry.body.kind === 'discover')).toBe(true)

		// That fresh crawl, with the source no longer lapsed, ingests.
		edge!.clock.advance(TEN_MINUTES)
		await edge!.drain()
		const black = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.black}`))
		expect(black.claims.length).toBeGreaterThan(0)
		expect((await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))).opid).toBe(entity.opid)
	})

	// 10 — the 30-day sweep withdrew claims and left the records live, so the next crawl found them
	// unchanged, asserted nothing, and the source read as silent.
	test('the thirty-day withdrawal takes the records with the claims, and the gap is visible', async () => {
		serveAcme()
		await edge!.crawl('acme.example')

		await edge!.sql`update source set lapsed_at = ${new Date(edge!.clock.now().getTime() - 31 * DAY)} where name = 'acme.example'`
		const swept = await lapseSweep(edge!.sql, { now: edge!.clock.now() })
		expect(swept.withdrawn[0]?.records).toBe(1)
		expect(swept.withdrawn[0]?.claims).toBeGreaterThan(0)

		const live = await edge!.sql<{ count: string }[]>`
			select count(*)::text as count from record where withdrawn_at is null
		`
		expect(live[0]?.count).toBe('0')

		// Recovery re-asserts with a new seen_at, and the withdrawn rows are what was said before.
		edge!.clock.advance(TEN_MINUTES)
		serveAcme()
		await edge!.crawl('acme.example')
		// The first crawl of a lapsed source only proves it can be read; the next one re-asserts.
		edge!.clock.advance(TEN_MINUTES)
		await edge!.drain()
		const history = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}?history=1`))
		const names = history.claims.filter((claim) => claim.property === 'name')
		expect(names).toHaveLength(2)
		expect(names.filter((claim) => claim.withdrawn_at !== undefined)).toHaveLength(1)
		const withdrawn = names.find((claim) => claim.withdrawn_at !== undefined)!
		const fresh = names.find((claim) => claim.withdrawn_at === undefined)!
		expect(Date.parse(fresh.seen_at)).toBeGreaterThan(Date.parse(withdrawn.seen_at))
	})

	// 8 — a Durable Object outage dead-lettered crawls instead of deferring them.
	test('a limiter that cannot be reached defers the crawl, it does not dead-letter it', async () => {
		serveAcme()
		const broken = {
			...edge!.limits,
			domainGate: () => Promise.reject(new Error('Durable Object reset because its code was updated')),
		}
		const services: Services = { ...edge!.services, limits: broken as unknown as Services['limits'] }

		const step = await consumeCrawl(services, { kind: 'discover', domain: 'acme.example' })
		expect(step.kind).toBe('deferred')
		expect(edge!.dead.letters).toHaveLength(0)
		expect(edge!.queue.pending).toHaveLength(1)
		expect(edge!.queue.pending[0]?.body.deferrals).toBe(1)
	})

	// 9 — past the deferral cap a crawl vanished: no log, no dead letter, no row.
	test('a crawl held back past the cap goes to the dead letter queue with the reason', async () => {
		serveAcme()
		const now = edge!.clock.now()
		// Twenty distinct zones, so no one of them is held back by its own share of the lane.
		for (let attempt = 0; attempt < 20; attempt += 1) await edge!.limits.hostFetch('acme.example', false, now, `z${attempt}.example`)

		const message: CrawlMessage = { kind: 'discover', domain: 'acme.example', deferrals: POLICY.maxDeferrals }
		await consumeCrawl(edge!.services, message)

		expect(edge!.queue.pending).toHaveLength(0)
		expect(edge!.dead.letters).toHaveLength(1)
		expect(edge!.dead.letters[0]?.reason).toContain('held back')
		expect(edge!.dead.letters[0]?.message).toMatchObject({ kind: 'discover', domain: 'acme.example' })
	})

	// 11 — a feed-budget deferral left an unfinished crawl row and partial feed state behind.
	test('a deferred feed resumes the same crawl and leaves no abandoned row', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(FEED, [JACKET.navy])

		// The document fetch is allowed; the feed fetch is not.
		const step = await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		expect(step.kind).toBe('continued')
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < 20; attempt += 1) await edge!.limits.hostFetch('acme.example', false, now, `z${attempt}.example`)

		const feedMessage = edge!.queue.ready()[0]!
		expect(await consumeCrawl(edge!.services, feedMessage)).toMatchObject({ kind: 'deferred' })

		const open = await edge!.sql<{ count: string }[]>`select count(*)::text as count from crawl where finished_at is null`
		expect(open[0]?.count).toBe('1')

		// The deferred message comes back and finishes that same crawl.
		edge!.clock.advance(POLICY.host.windowMs)
		await edge!.drain()
		const rows = await edge!.sql<{ count: string; open: string }[]>`
			select count(*)::text as count, count(*) filter (where finished_at is null)::text as open from crawl
		`
		expect(rows[0]?.count).toBe('1')
		expect(rows[0]?.open).toBe('0')
	})

	// 11 — and a crawl whose message never comes back is finished by the cron rather than left open.
	test('a crawl whose feed message never returns is finalized as unread', async () => {
		serveAcme()
		await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		edge!.queue.pending.length = 0

		edge!.clock.advance(2 * 3_600_000)
		const { finalizeStaleCrawls } = await import('@prodid/store')
		expect((await finalizeStaleCrawls(edge!.sql, { now: edge!.clock.now(), olderThanMs: 3_600_000 })).finished).toBe(1)
		const rows = await edge!.sql<{ outcome: string; error: string }[]>`select outcome, error from crawl`
		expect(rows[0]?.outcome).toBe('fetch-failed')
		expect(rows[0]?.error).toContain('abandoned')
	})

	// 12 — the lane was decided in two places and they disagreed.
	test('an unverified source whose name equals the host takes the unverified lane', async () => {
		serveAcme()
		// Twenty unverified fetches at this host, on behalf of other zones, exhaust that lane.
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < 20; attempt += 1) {
			await edge!.limits.hostFetch('acme.example', false, now, `z${attempt}.example`)
		}
		// A source that has never been verified must be held back by it, not slip into the reserve.
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'deferred' })
		expect(edge!.net.fetched).toHaveLength(0)
	})

	// 13 — two overlapping cron runs enqueued every due source twice.
	test('overlapping cron runs claim different sources, never the same one twice', async () => {
		serveAcme()
		await edge!.crawl('acme.example')
		edge!.queue.sent.length = 0
		edge!.clock.advance(7 * DAY)

		const [first, second] = await Promise.all([enqueueDue(edge!.services), enqueueDue(edge!.services)])
		expect(first + second).toBe(1)
		expect(edge!.queue.sent.filter((message) => message.kind === 'discover')).toHaveLength(1)

		// The claim is a lease: a crawl that never comes back makes the source due again.
		const stale = await claimDueSources(edge!.sql, {
			now: new Date(edge!.clock.now().getTime() + QUEUE_LEASE_MS + 1),
			intervalMs: 3_600_000,
			limit: 10,
		})
		expect(stale).toHaveLength(1)
	})

	// 15 — `/schemas/v0/__proto__` answered 200 with something.
	test('a schema path that is not a schema is a 404, whatever it is named', async () => {
		for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype']) {
			const response = await edge!.fetch(`/schemas/v0/${name}`)
			expect(response.status).toBe(404)
			expect(await json<{ type: string }>(response)).toMatchObject({ type: 'https://prodid.org/problem/not-found' })
			expect(response.headers.get('cache-control')).toBe('no-store')
		}
	})

	// 7 — the crawl is one row across several messages, and each message does one unit of work.
	test('one crawl is one row, and each message reads at most one feed', async () => {
		const feeds = ['https://acme.example/a.ndjson', 'https://acme.example/b.ndjson', 'https://acme.example/c.ndjson']
		edge!.net.document('acme.example', document({ feeds }))
		edge!.net.feed(feeds[0]!, [JACKET.navy])
		edge!.net.feed(feeds[1]!, [JACKET.black])
		edge!.net.feed(feeds[2]!, [JACKET.olive])

		await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		let messages = 0
		for (;;) {
			const due = edge!.queue.ready()
			if (due.length === 0) break
			expect(due).toHaveLength(1)
			const before = edge!.net.fetched.length
			await consumeCrawl(edge!.services, due[0]!)
			expect(edge!.net.fetched.length - before).toBeLessThanOrEqual(1)
			messages += 1
		}
		// Three feeds and one finalize.
		expect(messages).toBe(4)

		const rows = await edge!.sql<{ count: string; feeds_failed: number; records_seen: number }[]>`
			select count(*)::text as count, max(feeds_failed) as feeds_failed, max(records_seen) as records_seen from crawl
		`
		expect(rows[0]?.count).toBe('1')
		expect(rows[0]?.feeds_failed).toBe(0)
		expect(rows[0]?.records_seen).toBe(3)
	})

	// The conflicts a crawl found are a column now, not a sentence in `error`.
	test('an identifier disagreement is recorded on the crawl as data', async () => {
		const rows = await edge!.sql<{ id: string }[]>`
			insert into source (kind, name) values ('domain', 'other.example') returning id::text
		`
		const other = rows[0]!.id
		const mpnOnly = { ...item({ key: 'mpn-holder' }), identifiers: [{ scheme: 'mpn', value: 'TJ-NAVY' }] }
		const prepared = await prepareRecord(mpnOnly as never, other)
		if (!prepared.ok) throw new Error(prepared.error)
		await ingestRecord(edge!.sql, { source: other, record: prepared.prepared, now: edge!.clock.now() })

		serveAcme([item({ key: 'both', gtin: GTINS.navy, brand: 'Acme' })])
		await edge!.crawl('acme.example')
		edge!.clock.advance(TEN_MINUTES)
		serveAcme([
			{
				...item({ key: 'both', brand: 'Acme' }),
				identifiers: [
					{ scheme: 'gtin', value: GTINS.navy },
					{ scheme: 'mpn', value: 'TJ-NAVY' },
				],
			},
		])
		await edge!.crawl('acme.example')

		const crawls = await edge!.sql<{ conflicts: string | null }[]>`
			select conflicts::text as conflicts from crawl where conflicts is not null
		`
		expect(crawls).toHaveLength(1)
		const conflicts = JSON.parse(crawls[0]!.conflicts!) as { key: string; chosen: string; others: string[] }[]
		expect(conflicts[0]?.key).toBe('both')
		expect(conflicts[0]?.others).toHaveLength(1)
	})
})

describe.skipIf(!reachable)('finalize is idempotent', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a finalize message delivered twice does not write a second outcome', async () => {
		serveAcme()
		await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		let plan: CrawlPlan | null = null
		for (;;) {
			const due = edge!.queue.ready()
			if (due.length === 0) break
			const message = due[0]!
			if (message.kind === 'finalize') plan = message.plan
			await consumeCrawl(edge!.services, message)
		}
		expect(plan).not.toBeNull()
		expect(await runFinalize(edge!.services, plan!)).toMatchObject({ kind: 'ignored' })

		const rows = await edge!.sql<{ count: string }[]>`select count(*)::text as count from crawl where finished_at is not null`
		expect(rows[0]?.count).toBe('1')
	})
})

describe.skipIf(!reachable)('queues deliver at least once', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a feed message delivered twice does not count its records twice', async () => {
		serveAcme([JACKET.navy, JACKET.black])
		await consumeCrawl(edge!.services, { kind: 'discover', domain: 'acme.example' })
		const feedMessage = edge!.queue.ready()[0]!
		expect(feedMessage.kind).toBe('feed')

		await consumeCrawl(edge!.services, feedMessage)
		const fetched = edge!.net.fetched.length
		// The same message again, as the queue may deliver it.
		await consumeCrawl(edge!.services, feedMessage)
		expect(edge!.net.fetched.length).toBe(fetched)

		await edge!.drain()
		const rows = await edge!.sql<{ records_seen: number; records_changed: number }[]>`
			select records_seen, records_changed from crawl
		`
		expect(rows[0]?.records_seen).toBe(2)
		expect(rows[0]?.records_changed).toBe(2)
	})
})

describe('crawl dead letters', () => {
	const plan: CrawlPlan = {
		domain: 'acme.example',
		source: '1',
		crawl: '7',
		host: 'acme.example',
		via: 'well-known',
		documentUrl: 'https://acme.example/.well-known/prodid.json',
		status: 200,
		feeds: [FEED],
		zone: 'acme.example',
		upgrade: null,
		startedAt: '2026-09-19T08:00:00.000Z',
	}

	function logged(body: Parameters<typeof consumeDeadLetter>[0]): Record<string, unknown>[] {
		const warn = spyOn(console, 'warn').mockImplementation(() => {})
		try {
			consumeDeadLetter(body)
			return warn.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>)
		} finally {
			warn.mockRestore()
		}
	}

	test('a letter the consumer sent is logged with its reason', () => {
		const reason = "held back by the crawler's own limits 13 times"
		expect(logged({ reason, message: { kind: 'feed', plan, at: 0, deferrals: 13 } })).toEqual([
			{ event: 'crawl.dead-letter', reason, domain: 'acme.example', step: 'feed', crawl: '7', deferrals: 13 },
		])
	})

	test('a bare message the queue moved there after its retries is logged, not thrown away', () => {
		const discover = logged({ kind: 'discover', domain: 'acme.example' })
		expect(discover).toHaveLength(1)
		expect(discover[0]).toMatchObject({ event: 'crawl.dead-letter', domain: 'acme.example', step: 'discover', crawl: null, deferrals: 0 })
		expect(discover[0]?.reason).toContain('retry')

		const finalize = logged({ kind: 'finalize', plan, deferrals: 2 })
		expect(finalize).toEqual([
			{ event: 'crawl.dead-letter', reason: discover[0]?.reason, domain: 'acme.example', step: 'finalize', crawl: '7', deferrals: 2 },
		])
	})
})

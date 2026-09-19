import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { type EntityRecord, groupingDigests, type ItemRecord, validateEntity } from '@prodid/core'
import { ingestRecord, lapseSweep, type PreparedRecord, prepareRecord } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { runScheduled } from '../src/consumer'
import { document, GTINS, item, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const DAY = 86_400_000

async function source(name: string, kind = 'domain'): Promise<string> {
	const rows = await edge!.sql<{ id: string }[]>`
		insert into source (kind, name) values (${kind}, ${name}) returning id::text
	`
	return rows[0]!.id
}

async function prepared(record: ItemRecord, sourceId: string): Promise<PreparedRecord> {
	const result = await prepareRecord(record, sourceId)
	if (!result.ok) throw new Error(result.error)
	return result.prepared
}

describe.skipIf(!reachable)('what the store writes', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('every grouping key is the digest core derives, not one this package invented', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const record = item({ key: 'navy', gtin: GTINS.navy, group: 'trail', variant: { color: 'Navy' } })
		await ingestRecord(edge!.sql, { source: one, record: await prepared(record, one), now })

		const expected = await groupingDigests(record, { source: one })
		const rows = await edge!.sql<{ kind: string; key: string }[]>`select kind, key from grouping order by kind`
		expect([...rows]).toEqual([
			{ kind: 'family', key: expected.family },
			{ kind: 'variant', key: expected.variant },
		])
	})

	test('a value reaches the database canonical, so writing it another way changes nothing', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const first = item({ key: 'navy', gtin: GTINS.navy, properties: { weight: { value: 480, unit: 'g' } } as never })
		const ingested = await ingestRecord(edge!.sql, { source: one, record: await prepared(first, one), now })
		expect(ingested.claimsInserted).toBeGreaterThan(0)

		// The same facts, with the object written the other way round.
		const second = item({ key: 'navy', gtin: GTINS.navy, properties: { weight: { unit: 'g', value: 480 } } as never })
		const again = await ingestRecord(edge!.sql, { source: one, record: await prepared(second, one), now })
		expect(again.claimsInserted).toBe(0)
		expect(again.claimsWithdrawn).toBe(0)

		// It is stored as the value, not as a string holding the value's JSON.
		const kinds = await edge!.sql<{ property: string; kind: string }[]>`
			select property, jsonb_typeof(value) as kind from claim order by property
		`
		expect(kinds.find((row) => row.property === 'brand')?.kind).toBe('string')
		expect(kinds.find((row) => row.property === 'properties.weight')?.kind).toBe('object')
	})

	test('a restricted circulation number is stored as rcn, scoped to the source and shown by its name', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const record = item({ key: 'rcn', gtin: GTINS.restricted, sku: 'R-1' })
		const ingested = await ingestRecord(edge!.sql, { source: one, record: await prepared(record, one), now })

		const entity = await json<EntityRecord>(await edge!.fetch(`/id/${ingested.opid}`))
		const valid = validateEntity(entity)
		if (!valid.ok) throw new Error(`entity is not valid: ${JSON.stringify(valid.errors)}`)
		expect(entity.identifiers).toContainEqual({ scheme: 'rcn', value: GTINS.restricted.padStart(14, '0'), scope: 'one.example' })
		expect(entity.identifiers).toContainEqual({ scheme: 'sku', value: 'R-1', scope: 'one.example' })
		// A restricted number resolves nothing globally.
		expect((await edge!.fetch(`/01/${GTINS.restricted}`)).status).toBe(404)
	})

	test('a record with a string that cannot be stored costs its own line', async () => {
		const one = await source('one.example')
		const broken = { ...item({ key: 'broken', gtin: GTINS.navy }), name: `bad\u0000name` } as ItemRecord
		const result = await prepareRecord(broken, one)
		expect(result.ok).toBe(false)
	})
})

describe.skipIf(!reachable)('the cron', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('due sources are enqueued and the sweep lapses what has been failing for a week', async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy])
		await edge!.crawl('acme.example')
		edge!.queue.sent.length = 0

		// Not due yet.
		await runScheduled(edge!.services)
		expect(edge!.queue.sent).toHaveLength(0)

		edge!.clock.advance(7 * DAY)
		await runScheduled(edge!.services)
		expect(edge!.queue.sent).toEqual([{ kind: 'discover', domain: 'acme.example' }])

		// A source whose failures started eight days ago lapses on the sweep alone.
		await edge!.sql`update source set failing_since = ${new Date(edge!.clock.now().getTime() - 8 * DAY)} where name = 'acme.example'`
		const swept = await lapseSweep(edge!.sql, { now: edge!.clock.now() })
		expect(swept.lapsed).toHaveLength(1)
		expect((await json<{ lapsed: boolean }>(await edge!.fetch('/source/acme.example'))).lapsed).toBe(true)
	})
})

describe.skipIf(!reachable)('media is not claimed yet', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('a record with media keeps it in the body and makes no media claim', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const withMedia = {
			...item({ key: 'navy', gtin: GTINS.navy }),
			media: [{ url: 'https://acme.example/img/navy.webp', license: 'CC-BY-4.0', kind: 'image' }],
		} as ItemRecord
		const ingested = await ingestRecord(edge!.sql, { source: one, record: await prepared(withMedia, one), now })

		const entity = await json<EntityRecord>(await edge!.fetch(`/id/${ingested.opid}`))
		expect(validateEntity(entity).ok).toBe(true)
		expect(entity.claims.map((claim) => claim.property)).not.toContain('media')

		const rows = await edge!.sql<{ kind: string; body: string }[]>`
			select jsonb_typeof(body) as kind, body::text as body from record where key = 'navy'
		`
		expect(rows[0]?.kind).toBe('object')
		expect((JSON.parse(rows[0]!.body) as { media: unknown[] }).media).toHaveLength(1)
	})
})

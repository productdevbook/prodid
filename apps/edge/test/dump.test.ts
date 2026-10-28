import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type EntityRecord, type SourceRecord, validateEntity, validateSource } from '@prodid/core'
import {
	type DumpSnapshot,
	type EntityLine,
	type GroupingLine,
	ingestRecord,
	type MergeLine,
	mergeEntities,
	prepareRecord,
	readSnapshot,
	type RecordLine,
	revertMerge,
} from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { document, GTINS, gtin13, item, png } from './support/fixtures'
import { type Edge, json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const HOUR = 3_600_000
const ACME_FEED = 'https://acme.example/items.ndjson'
const BETA_FEED = 'https://beta.example/items.ndjson'
const DELTA_FEED = 'https://hosting.example/delta.ndjson'
const GAMMA_FEED = 'https://gamma.example/items.ndjson'
const IMAGE = 'https://acme.example/navy.png'

export interface Dump {
	snapshotAt: Date
	sources: SourceRecord[]
	entities: EntityLine[]
	records: RecordLine[]
	groupings: GroupingLine[]
	merges: MergeLine[]
}

async function collect<T>(lines: AsyncIterable<T>): Promise<T[]> {
	const all: T[] = []
	for await (const line of lines) all.push(line)
	return all
}

export async function collectSnapshot(snapshot: DumpSnapshot): Promise<Dump> {
	return {
		snapshotAt: snapshot.snapshotAt,
		sources: await collect(snapshot.sources()),
		entities: await collect(snapshot.entities()),
		records: await collect(snapshot.records()),
		groupings: await collect(snapshot.groupings()),
		merges: await collect(snapshot.merges()),
	}
}

async function opidOf(at: Edge, gtin: string): Promise<string> {
	const response = await at.fetch(`/01/${gtin}`)
	expect(response.status).toBe(200)
	return (await json<EntityRecord>(response)).opid
}

/**
 * An index with something of everything a dump carries: two verified sources sharing an item, a
 * delegated one, a lapsed one, a withdrawn record, a withdrawn claim, a media claim, a scoped `sku`
 * and `rcn`, a family of its own, an active merge and a reverted one.
 */
export async function populate(at: Edge): Promise<void> {
	at.net.document('acme.example', document({ feeds: [ACME_FEED], publisher: { name: 'Acme', contact: 'data@acme.example' } }))
	at.net.serve(IMAGE, { status: 200, headers: { 'content-type': 'image/png' }, body: png(7) })
	const navy = item({
		key: 'tj-navy-m',
		group: 'trail-jacket',
		variant: { color: 'Navy', size: 'M' },
		gtin: GTINS.navy,
		sku: 'TJ-NV-M',
		markets: ['DE', 'TR'],
		properties: { weight: '480 g' },
		media: [{ url: IMAGE, license: 'CC0-1.0' }],
	})
	const black = item({
		key: 'tj-black-m',
		group: 'trail-jacket',
		variant: { color: 'Black', size: 'M' },
		gtin: GTINS.black,
		sku: 'TJ-BK-M',
	})
	const olive = item({ key: 'tj-olive-m', group: 'trail-jacket', variant: { color: 'Olive', size: 'M' }, gtin: GTINS.olive })
	const gift = item({ key: 'gift-card', name: 'Gift Card', gtin: GTINS.restricted, sku: 'GIFT' })
	at.net.feed(ACME_FEED, [navy, black, olive, gift])
	expect((await at.crawl('acme.example')).kind).toBe('done')
	await at.drainMedia()

	at.clock.advance(HOUR)
	at.net.feed(ACME_FEED, [navy, { ...black, name: 'Trail Jacket II' }, gift])
	expect((await at.crawl('acme.example')).kind).toBe('done')

	at.clock.advance(HOUR)
	at.net.document('beta.example', document({ feeds: [BETA_FEED], license: 'CC-BY-4.0', publisher: { name: 'Beta' } }))
	at.net.feed(BETA_FEED, [
		item({ key: 'b-navy', name: 'Trail Jacket (navy)', group: 'tj', variant: { colour: 'navy' }, gtin: GTINS.navy }),
		item({ key: 'b-other', name: 'Trail Jacket', brand: 'Beta', gtin: GTINS.other, sku: 'B-OTHER' }),
	])
	expect((await at.crawl('beta.example')).kind).toBe('done')

	at.clock.advance(HOUR)
	at.net.setTxt('_prodid.delta.example', ['v=prodid0; host=hosting.example'])
	at.net.document('hosting.example', document({ domain: 'delta.example', feeds: [DELTA_FEED], publisher: { name: 'Delta' } }))
	at.net.feed(DELTA_FEED, [item({ key: 'd-1', name: 'Delta Boot', brand: 'Delta', gtin: gtin13('400638133478'), sku: 'D-1' })])
	expect((await at.crawl('delta.example')).kind).toBe('done')

	at.clock.advance(HOUR)
	at.net.document('gamma.example', document({ feeds: [GAMMA_FEED], license: 'CC-BY-SA-4.0', publisher: { name: 'Gamma' } }))
	at.net.feed(GAMMA_FEED, [item({ key: 'g-black', name: 'Black Trail Jacket', brand: 'Gamma', gtin: GTINS.black })])
	expect((await at.crawl('gamma.example')).kind).toBe('done')
	at.clock.advance(HOUR)
	at.net.serve('https://gamma.example/.well-known/prodid.json', { status: 404, headers: { 'content-type': 'text/html' } })
	await at.crawl('gamma.example')

	const now = at.clock.now()
	const other = await opidOf(at, GTINS.other)
	const blackItem = await opidOf(at, GTINS.black)
	await mergeEntities(at.sql, { from: other, into: blackItem, reason: 'same jacket', decidedBy: 'operator', now })
	const rows = await at.sql<{ opid: string }[]>`
		select r.opid from record r join source s on s.id = r.source where s.name = 'acme.example' and r.key = 'gift-card'
	`
	const giftItem = rows[0]!.opid
	await mergeEntities(at.sql, { from: giftItem, into: await opidOf(at, GTINS.navy), reason: 'mistake', decidedBy: 'operator', now })
	at.clock.advance(HOUR)
	await revertMerge(at.sql, { from: giftItem, now: at.clock.now() })
}

const NEVER = ['contact', 'id', 'error', 'reason', 'decided_by', 'blocked_reason', 'notified_lapse_at']

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
	if (Array.isArray(value)) for (const entry of value) keysOf(entry, into)
	else if (value !== null && typeof value === 'object') {
		for (const [key, entry] of Object.entries(value)) {
			into.add(key)
			keysOf(entry, into)
		}
	}
	return into
}

describe.skipIf(!reachable)('a snapshot export', () => {
	let dump: Dump

	beforeAll(async () => {
		await edge!.reset()
		await populate(edge!)
		dump = await readSnapshot(edge!.sql, collectSnapshot)
	})

	test('every source line is the status /source answers', async () => {
		expect(dump.sources.map((line) => line.name)).toEqual(['acme.example', 'beta.example', 'delta.example', 'gamma.example'])
		for (const line of dump.sources) {
			expect(validateSource(line).ok).toBe(true)
			const response = await edge!.fetch(`/source/${line.name}`)
			expect(await json<SourceRecord>(response)).toEqual(line)
		}
		expect(dump.sources.find((line) => line.name === 'gamma.example')?.lapsed).toBe(true)
	})

	test('every entity line is /id?history=1, and a merged one is what it would answer unmerged plus merged_into', async () => {
		const { count } = (await edge!.sql<{ count: number }[]>`select count(*)::int as count from entity`)[0]!
		expect(dump.entities).toHaveLength(count)
		expect(new Set(dump.entities.map((line) => line.opid)).size).toBe(count)

		const merged = dump.entities.filter((line) => line.merged_into !== undefined)
		expect(merged).toHaveLength(1)
		for (const line of dump.entities) {
			const response = await edge!.fetch(`/id/${line.opid}?history=1`, { headers: { accept: 'application/json' } })
			if (line.merged_into === undefined) {
				expect(response.status).toBe(200)
				expect(await json<EntityRecord>(response)).toEqual(line)
				expect(validateEntity(line).ok).toBe(true)
				continue
			}
			expect(response.status).toBe(308)
			expect(response.headers.get('location')).toBe(`/id/${line.merged_into}?history=1`)
			const { merged_into, ...unmerged } = line
			expect(validateEntity(unmerged).ok).toBe(true)
			expect(unmerged.identifiers).toContainEqual({ scheme: 'gtin', value: GTINS.other.padStart(14, '0') })
			const survivor = dump.entities.find((entry) => entry.opid === merged_into)!
			expect(survivor.merged_from).toEqual([line.opid])
			expect(survivor.merged_into).toBeUndefined()
		}

		const withdrawn = dump.entities.flatMap((line) => line.claims).filter((claim) => claim.withdrawn_at !== undefined)
		expect(withdrawn.length).toBeGreaterThan(0)
		expect(dump.entities.flatMap((line) => line.claims).some((claim) => claim.property === 'media')).toBe(true)
	})

	test('record lines carry exactly their fields, withdrawn ones included', async () => {
		const allowed = new Set(['source', 'key', 'feed', 'opid', 'body', 'first_seen', 'last_seen', 'withdrawn_at'])
		for (const line of dump.records) {
			for (const key of Object.keys(line)) expect(allowed.has(key)).toBe(true)
			expect(line.body.$type).toBe('org.prodid.item')
			expect(line.body.key).toBe(line.key)
			expect(line.feed).toMatch(/^https:\/\//)
		}
		expect(dump.records).toHaveLength(8)
		const olive = dump.records.find((line) => line.key === 'tj-olive-m')!
		expect(olive.source).toBe('acme.example')
		expect(olive.withdrawn_at).toBeDefined()
		expect(dump.records.filter((line) => line.withdrawn_at !== undefined)).toHaveLength(1)
	})

	test('grouping lines write the key out, never the digest that embeds the source id', async () => {
		const { count } = (await edge!.sql<{ count: number }[]>`select count(*)::int as count from grouping`)[0]!
		expect(dump.groupings).toHaveLength(count)
		const acme = dump.groupings.filter((line) => line.source === 'acme.example')
		expect(acme).toContainEqual(expect.objectContaining({ kind: 'family', key: { group: 'trail-jacket' } }))
		expect(acme).toContainEqual(expect.objectContaining({ kind: 'family', key: { key: 'gift-card' } }))
		expect(acme).toContainEqual(
			expect.objectContaining({ kind: 'variant', key: { family: { group: 'trail-jacket' }, variant: { color: 'Navy', size: 'M' } } }),
		)
		expect(acme).toContainEqual(expect.objectContaining({ kind: 'variant', key: { family: { key: 'gift-card' }, variant: {} } }))
		for (const line of dump.groupings) {
			expect(Object.keys(line).sort()).toEqual(['key', 'kind', 'opid', 'source'])
			expect(typeof line.key).toBe('object')
		}
		const navyItem = dump.entities.find((line) => line.identifiers.some((entry) => entry.value === GTINS.navy.padStart(14, '0')))!
		const beta = dump.groupings.find(
			(line) => line.source === 'beta.example' && line.kind === 'variant' && 'family' in line.key && 'group' in line.key.family,
		)!
		expect(beta.opid).toBe(navyItem.parents!.variant!)
	})

	test('merge lines say who into whom and when, reverted ones included', async () => {
		expect(dump.merges).toHaveLength(2)
		for (const line of dump.merges) {
			expect(Object.keys(line).filter((key) => key !== 'reverted_at')).toEqual(['from', 'into', 'decided_at'])
		}
		expect(dump.merges.filter((line) => line.reverted_at !== undefined)).toHaveLength(1)
	})

	test('nothing a dump never holds is in any line', async () => {
		const seen = keysOf([dump.sources, dump.entities, dump.records, dump.groupings, dump.merges])
		for (const key of NEVER) expect(seen.has(key)).toBe(false)
		expect(JSON.stringify(dump)).not.toContain('data@acme.example')
		expect(JSON.stringify(dump)).not.toContain('same jacket')
	})

	test('reading in pages of two gives the same lines as reading in one page', async () => {
		const paged = await readSnapshot(edge!.sql, collectSnapshot, { page: 2 })
		expect({ ...paged, snapshotAt: null }).toEqual({ ...dump, snapshotAt: null })
	})

	test('every iterator reads the one snapshot, whatever commits while the dump runs', async () => {
		const late = await readSnapshot(edge!.sql, async (snapshot) => {
			const sources = await collect(snapshot.sources())
			const acme = (await edge!.sql<{ id: string }[]>`select id::text from source where name = 'acme.example'`)[0]!.id
			const prepared = await prepareRecord(item({ key: 'late', name: 'Late Jacket', gtin: gtin13('400638133492') }), acme)
			if (!prepared.ok) throw new Error(prepared.error)
			await ingestRecord(edge!.sql, { source: acme, feed: ACME_FEED, record: prepared.prepared, now: edge!.clock.now() })
			await edge!.sql`update source set license = 'CC-BY-4.0' where name = 'acme.example'`
			return { ...(await collectSnapshot(snapshot)), sources }
		})
		expect(late.records.map((line) => line.key)).not.toContain('late')
		expect(late.entities).toHaveLength(dump.entities.length)
		expect(late.groupings).toHaveLength(dump.groupings.length)
		expect(late.sources.find((line) => line.name === 'acme.example')?.license).toBe('CC0-1.0')
		const after = await readSnapshot(edge!.sql, async (snapshot) => await collect(snapshot.records()))
		expect(after.map((line) => line.key)).toContain('late')
	})
})

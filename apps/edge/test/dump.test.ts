import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type EntityRecord, type SourceRecord, validateEntity, validateSource } from '@prodid/core'
import {
	DumpError,
	type DumpLines,
	type DumpSnapshot,
	type EntityLine,
	type GroupingLine,
	ingestRecord,
	loadDump,
	LOADED_MERGE_REASON,
	type MergeLine,
	mergeEntities,
	prepareRecord,
	readSnapshot,
	type RecordLine,
	revertMerge,
} from '@prodid/store'
import { createDatabase, databaseReachable } from '@prodid/store/testing'

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

function linesOf(dump: Dump): DumpLines {
	return { sources: dump.sources, entities: dump.entities, records: dump.records, groupings: dump.groupings, merges: dump.merges }
}

async function answer(at: Edge, path: string): Promise<{ status: number; location: string | null; body: unknown }> {
	const response = await at.fetch(path, { headers: { accept: 'application/json' } })
	return {
		status: response.status,
		location: response.headers.get('location'),
		body: response.status === 308 ? null : await response.json(),
	}
}

const MOSS = gtin13('400638133515')

describe.skipIf(!reachable)('loading a dump', () => {
	let dump: Dump
	let target: (Edge & { stop(): Promise<void> }) | null = null

	beforeAll(async () => {
		await edge!.reset()
		await populate(edge!)
		dump = await readSnapshot(edge!.sql, collectSnapshot)
		target = await startEdge({ at: new Date(edge!.clock.now().getTime() + HOUR) })
		const loaded = await loadDump(target.sql, linesOf(dump), { operator: 'test' })
		expect(loaded).toEqual({
			sources: dump.sources.length,
			entities: dump.entities.length,
			records: dump.records.length,
			groupings: dump.groupings.length,
			merges: dump.merges.length,
		})
	})
	afterAll(async () => {
		await target?.stop()
	})

	test('every opid answers on the loaded index exactly as on the one dumped', async () => {
		for (const line of dump.entities) {
			for (const query of ['', '?history=1']) {
				expect(await answer(target!, `/id/${line.opid}${query}`)).toEqual(await answer(edge!, `/id/${line.opid}${query}`))
			}
		}
		for (const gtin of [GTINS.navy, GTINS.black, GTINS.other]) {
			expect(await answer(target!, `/01/${gtin}?history=1`)).toEqual(await answer(edge!, `/01/${gtin}?history=1`))
		}
		for (const line of dump.sources) {
			expect(await answer(target!, `/source/${line.name}`)).toEqual(await answer(edge!, `/source/${line.name}`))
		}
	})

	test('a dump of the loaded index is the dump it was loaded from', async () => {
		const again = await readSnapshot(target!.sql, collectSnapshot)
		expect({ ...again, snapshotAt: null }).toEqual({ ...dump, snapshotAt: null })
		const merges = await target!.sql<{ reason: string; decided_by: string }[]>`select reason, decided_by from merge`
		expect([...merges]).toEqual(dump.merges.map(() => ({ reason: LOADED_MERGE_REASON, decided_by: 'test' })))
		const unattributed = await target!.sql<{ count: number; media: number }[]>`
			select count(*)::int as count, count(*) filter (where property = 'media')::int as media from claim where withdrawn_at is null
				and record_key is null
		`
		expect(unattributed[0]).toEqual({ count: 0, media: 0 })
		const values = await target!.sql<{ type: string }[]>`select distinct jsonb_typeof(body) as type from record`
		expect(values.map((row) => row.type)).toEqual(['object'])
	})

	test('a crawl continues from the loaded records and groupings instead of minting', async () => {
		const count = async () => (await target!.sql<{ count: number }[]>`select count(*)::int as count from entity`)[0]!.count
		const before = await count()
		const live = dump.records.filter((line) => line.source === 'acme.example' && line.withdrawn_at === undefined).map((line) => line.body)
		const moss = item({ key: 'tj-moss-m', group: 'trail-jacket', variant: { color: 'Moss', size: 'M' }, gtin: MOSS })
		target!.net.document('acme.example', document({ feeds: [ACME_FEED] }))
		target!.net.serve(IMAGE, { status: 200, headers: { 'content-type': 'image/png' }, body: png(7) })
		target!.net.feed(ACME_FEED, [...live, moss])
		const crawlStarted = target!.clock.now()
		expect((await target!.crawl('acme.example')).kind).toBe('done')

		expect(await count()).toBe(before + 2)
		const status = await json<SourceRecord>(await target!.fetch('/source/acme.example'))
		expect(status.last_crawl).toMatchObject({ outcome: 'success', records_seen: live.length + 1, records_changed: 1 })
		const navy = await json<EntityRecord>(await target!.fetch(`/01/${GTINS.navy}`))
		const added = await json<EntityRecord>(await target!.fetch(`/01/${MOSS}`))
		expect(added.parents?.family).toBe(navy.parents!.family!)
		const fresh = await target!.sql<{ key: string }[]>`
			select distinct c.record_key as key from claim c join source s on s.id = c.source
			where s.name = 'acme.example' and (c.seen_at >= ${crawlStarted} or c.withdrawn_at >= ${crawlStarted})
		`
		expect(fresh.map((row) => row.key)).toEqual(['tj-moss-m'])
	})

	test('a database that is not empty is refused', async () => {
		await expect(loadDump(target!.sql, linesOf(dump), { operator: 'test' })).rejects.toThrow(/not empty/)
	})

	test('a dump that cannot be loaded leaves the database as empty as it was', async () => {
		const empty = await createDatabase()
		try {
			const broken = { ...dump, records: [...dump.records, { ...dump.records[0]!, key: 'stray', source: 'nobody.example' }] }
			const failure = await loadDump(empty.sql, linesOf(broken), { operator: 'test' }).catch((error: unknown) => error)
			expect(failure).toBeInstanceOf(DumpError)
			expect(failure).toMatchObject({ file: 'records.ndjson.gz', line: dump.records.length + 1 })
			const [row] = await empty.sql<{ count: number }[]>`
				select ((select count(*) from source) + (select count(*) from entity) + (select count(*) from crawl))::int as count
			`
			expect(row!.count).toBe(0)
		} finally {
			await empty.drop()
		}
	})
})

describe.skipIf(!reachable)('a grouping no record produces any more', () => {
	const KEY = 'tj-navy-m'
	const old = { family: { group: 'trail-jacket' }, variant: { family: { group: 'trail-jacket' }, variant: { color: 'Navy' } } }
	const regrouped = { family: { group: 'jackets' }, variant: { family: { group: 'jackets' }, variant: { color: 'Navy' } } }

	beforeAll(async () => {
		await edge!.reset()
		edge!.net.document('acme.example', document({ feeds: [ACME_FEED] }))
		edge!.net.feed(ACME_FEED, [item({ key: KEY, group: 'trail-jacket', variant: { color: 'Navy' }, gtin: GTINS.navy })])
		expect((await edge!.crawl('acme.example')).kind).toBe('done')
		edge!.clock.advance(HOUR)
		edge!.net.feed(ACME_FEED, [item({ key: KEY, group: 'jackets', variant: { color: 'Navy' }, gtin: GTINS.navy })])
		expect((await edge!.crawl('acme.example')).kind).toBe('done')
	})

	test('keeps its line in the dump, and a load and a dump again give it back', async () => {
		const dump = await readSnapshot(edge!.sql, collectSnapshot)
		const navy = dump.entities.find((line) => line.kind === 'item')!
		const keys = dump.groupings.map((line) => ({ kind: line.kind, key: line.key, opid: line.opid }))
		expect(keys).toHaveLength(4)
		for (const keyed of [old, regrouped]) {
			expect(keys).toContainEqual({ kind: 'family', key: keyed.family, opid: navy.parents!.family! })
			expect(keys).toContainEqual({ kind: 'variant', key: keyed.variant, opid: navy.parents!.variant! })
		}
		expect(dump.records.map((line) => line.body.group)).toEqual(['jackets'])
		const written = await edge!.sql<{ type: string }[]>`select distinct jsonb_typeof(written_key) as type from grouping`
		expect(written.map((row) => row.type)).toEqual(['object'])

		const target = await startEdge({ at: new Date(edge!.clock.now().getTime() + HOUR) })
		try {
			expect((await loadDump(target.sql, linesOf(dump), { operator: 'test' })).groupings).toBe(4)
			const again = await readSnapshot(target.sql, collectSnapshot)
			expect({ ...again, snapshotAt: null }).toEqual({ ...dump, snapshotAt: null })
			const [stored] = await target.sql<{ count: number }[]>`select count(*)::int as count from grouping where written_key is not null`
			expect(stored!.count).toBe(4)
		} finally {
			await target.stop()
		}
	})

	test('a row older than its written key is left out of the dump and counted', async () => {
		await edge!.sql`
			update grouping set written_key = null where kind = 'variant' and written_key->'family' = '{"group":"trail-jacket"}'::jsonb
		`
		const { lines, missing } = await readSnapshot(edge!.sql, async (snapshot) => ({
			lines: await collect(snapshot.groupings()),
			missing: await snapshot.groupingsWithoutKey(),
		}))
		expect(lines).toHaveLength(3)
		expect(missing).toBe(1)
	})
})

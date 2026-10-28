import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { type ItemRecord, type SourceRecord, validateSource } from '@prodid/core'
import {
	claimDueSources,
	datasetSourceName,
	ensureDatasetSource,
	finalizeStaleCrawls,
	finishImport,
	importRecords,
	lapseSweep,
	type PreparedRecord,
	prepareRecord,
	readSnapshot,
	type RecordLine,
	startImport,
} from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { gtin13, item } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const DAY = 86_400_000
const EXPORT = 'https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.gz'

const RECORDS = [
	item({ key: 'Q1', name: 'Kettle', brand: 'Acme', gtin: gtin13('400638133601') }),
	item({ key: 'Q2', name: 'Toaster', brand: 'Acme', gtin: gtin13('400638133602') }),
	item({ key: 'Q3', name: 'Blender', brand: 'Beta', gtin: gtin13('400638133603') }),
]

async function prepared(records: readonly ItemRecord[], source: string): Promise<PreparedRecord[]> {
	return await Promise.all(
		records.map(async (record) => {
			const result = await prepareRecord(record, source)
			if (!result.ok) throw new Error(result.error)
			return result.prepared
		}),
	)
}

async function runImport(records: readonly ItemRecord[], options: { full?: boolean; finish?: boolean } = {}) {
	const now = edge!.clock.now()
	const source = await ensureDatasetSource(edge!.sql, { slug: 'wikidata', license: 'CC0-1.0', now })
	const run = await startImport(edge!.sql, { source: source.id, documentUrl: EXPORT, startedAt: now })
	const ingested = await importRecords(edge!.sql, run, { records: await prepared(records, source.id), now })
	if (options.finish === false) return { source, run, ingested, finished: null }
	edge!.clock.advance(60_000)
	const finished = await finishImport(edge!.sql, run, { full: options.full ?? true, finishedAt: edge!.clock.now() })
	return { source, run, ingested, finished }
}

async function claimRows() {
	return await edge!.sql<{ id: string; key: string; seen_at: Date; withdrawn_at: Date | null }[]>`
		select id::text, record_key as key, seen_at, withdrawn_at from claim order by id
	`
}

async function status(): Promise<SourceRecord> {
	const response = await edge!.fetch('/source/dataset:wikidata')
	expect(response.status).toBe(200)
	return await json<SourceRecord>(response)
}

describe.skipIf(!reachable)('a dataset import', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('the first import writes every record with no feed, under one import crawl', async () => {
		const { source, ingested, finished } = await runImport(RECORDS)
		expect(source).toMatchObject({ kind: 'dataset', name: 'dataset:wikidata', trust: 'unverified', license: 'CC0-1.0' })
		expect(ingested).toMatchObject({ seen: 3, changed: 3 })
		expect(finished).toEqual({ outcome: 'changed', withdrawn: { records: 0, claims: 0 } })

		const records = await edge!.sql<{ key: string; feed: string | null; type: string }[]>`
			select key, feed, jsonb_typeof(body) as type from record order by key
		`
		expect([...records]).toEqual(RECORDS.map((record) => ({ key: record.key, feed: null, type: 'object' })))
		const crawls = await edge!.sql<{ via: string; document_url: string; outcome: string; http_status: number | null }[]>`
			select via, document_url, outcome, http_status from crawl
		`
		expect([...crawls]).toEqual([{ via: 'import', document_url: EXPORT, outcome: 'changed', http_status: null }])

		const shown = await status()
		expect(validateSource(shown).ok).toBe(true)
		expect(shown).toMatchObject({ kind: 'dataset', trust: 'unverified', lapsed: false, license: 'CC0-1.0' })
		expect(shown.last_crawl).toEqual({
			at: edge!.clock.now().toISOString(),
			via: 'import',
			document_url: EXPORT,
			outcome: 'success',
			records_seen: 3,
			records_changed: 3,
			lines_skipped: 0,
			feeds_failed: 0,
			media_failed: 0,
		})
	})

	test('re-importing the same export changes no claim', async () => {
		await runImport(RECORDS)
		const before = await claimRows()
		edge!.clock.advance(DAY)
		const { ingested, finished } = await runImport(RECORDS)
		expect(ingested).toMatchObject({ seen: 3, changed: 0, claimsInserted: 0, claimsWithdrawn: 0 })
		expect(finished).toEqual({ outcome: 'unchanged', withdrawn: { records: 0, claims: 0 } })
		expect(await claimRows()).toEqual(before)
		expect((await status()).last_crawl).toMatchObject({ outcome: 'success', records_seen: 3, records_changed: 0 })
		const [count] = await edge!.sql<{ count: number }[]>`select count(*)::int as count from crawl where via = 'import'`
		expect(count!.count).toBe(2)
	})

	test('a full import withdraws the key it no longer carries, with its claims, at one time', async () => {
		await runImport(RECORDS)
		edge!.clock.advance(DAY)
		const { finished } = await runImport(RECORDS.filter((record) => record.key !== 'Q2'))
		const at = edge!.clock.now()
		expect(finished!.outcome).toBe('changed')
		expect(finished!.withdrawn.records).toBe(1)
		expect(finished!.withdrawn.claims).toBeGreaterThan(0)

		const records = await edge!.sql<{ key: string; withdrawn_at: Date | null }[]>`select key, withdrawn_at from record order by key`
		expect([...records]).toEqual([
			{ key: 'Q1', withdrawn_at: null },
			{ key: 'Q2', withdrawn_at: at },
			{ key: 'Q3', withdrawn_at: null },
		])
		const claims = await claimRows()
		expect(claims.filter((claim) => claim.key === 'Q2').every((claim) => claim.withdrawn_at?.getTime() === at.getTime())).toBe(true)
		expect(claims.filter((claim) => claim.key !== 'Q2').every((claim) => claim.withdrawn_at === null)).toBe(true)
		expect(claims.filter((claim) => claim.key === 'Q2')).toHaveLength(finished!.withdrawn.claims)
	})

	test('an import that is not full withdraws nothing', async () => {
		await runImport(RECORDS)
		edge!.clock.advance(DAY)
		const { finished } = await runImport(RECORDS.slice(0, 1), { full: false })
		expect(finished).toEqual({ outcome: 'unchanged', withdrawn: { records: 0, claims: 0 } })
		const [live] = await edge!.sql<{ count: number }[]>`select count(*)::int as count from record where withdrawn_at is null`
		expect(live!.count).toBe(3)
	})

	test('the dump writes an imported record with no feed', async () => {
		await runImport(RECORDS)
		const lines = await readSnapshot(edge!.sql, async (snapshot) => {
			const all: RecordLine[] = []
			for await (const line of snapshot.records()) all.push(line)
			return all
		})
		expect(lines).toHaveLength(3)
		for (const line of lines) expect('feed' in line).toBe(false)
	})

	test('an unfinished import is never shown, never closed as a failure, and never crawled', async () => {
		await runImport(RECORDS)
		const shown = await status()
		edge!.clock.advance(DAY)
		await runImport(RECORDS.slice(0, 1), { finish: false })
		edge!.clock.advance(30 * DAY)
		const stale = await finalizeStaleCrawls(edge!.sql, { now: edge!.clock.now(), olderThanMs: 6 * 3_600_000 })
		expect(stale.finished).toBe(0)
		const swept = await lapseSweep(edge!.sql, { now: edge!.clock.now() })
		expect(swept.lapsed).toEqual([])
		expect(await claimDueSources(edge!.sql, { now: edge!.clock.now(), intervalMs: DAY, limit: 10 })).toEqual([])
		expect(await status()).toEqual(shown)
	})

	test('a dataset is named by its slug and never anything else', async () => {
		expect(datasetSourceName('wikidata')).toBe('dataset:wikidata')
		for (const slug of ['ab', 'Wiki', '-wiki', 'wiki-', 'ab--cd', 'a'.repeat(33)]) expect(datasetSourceName(slug)).toBeNull()
		expect(datasetSourceName('a'.repeat(32))).toBe(`dataset:${'a'.repeat(32)}`)
		expect(() => ensureDatasetSource(edge!.sql, { slug: 'ab--cd', license: null, now: edge!.clock.now() })).toThrow(RangeError)
	})

	test('the database refuses an import of anything but a dataset, and a dataset that lapses or is crawled', async () => {
		const now = edge!.clock.now()
		const dataset = await ensureDatasetSource(edge!.sql, { slug: 'wikidata', license: 'CC0-1.0', now })
		const [domain] = await edge!.sql<{ id: string }[]>`
			insert into source (kind, name) values ('domain', 'acme.example') returning id::text
		`
		await expect(startImport(edge!.sql, { source: domain!.id, documentUrl: EXPORT, startedAt: now })).rejects.toThrow(/not a dataset/)
		await expect(
			edge!.sql`insert into crawl (source, via, document_url, started_at) values (${dataset.id}, 'well-known', ${EXPORT}, ${now})`,
		).rejects.toThrow(/only ever imported/)
		await expect(edge!.sql`update source set lapsed_at = ${now} where id = ${dataset.id}`).rejects.toThrow(/source_dataset/)
		await expect(edge!.sql`update source set kind = 'domain' where id = ${dataset.id}`).rejects.toThrow(/cannot change kind/)
		await expect(edge!.sql`insert into source (kind, name) values ('domain', 'dataset:wiki')`).rejects.toThrow(/source_dataset/)
		const run = await startImport(edge!.sql, { source: dataset.id, documentUrl: EXPORT, startedAt: now })
		await expect(edge!.sql`update crawl set http_status = 200 where id = ${run.crawl}`).rejects.toThrow(/crawl_import/)
		await expect(edge!.sql`update crawl set finished_at = ${now}, outcome = 'fetch-failed' where id = ${run.crawl}`).rejects.toThrow(
			/crawl_import/,
		)
		await expect(startImport(edge!.sql, { source: dataset.id, documentUrl: 'http://example.org/x', startedAt: now })).rejects.toThrow(
			RangeError,
		)
		await expect(importRecords(edge!.sql, run, { records: [], now: new Date(now.getTime() - 1) })).rejects.toThrow(RangeError)
	})
})

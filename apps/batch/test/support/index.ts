import { readNdjson, type SourceKind, validateItem } from '@prodid/core'
import {
	accumulateCrawl,
	ensureFeeds,
	findOrCreateSource,
	finishCrawl,
	ingestRecords,
	mergeEntities,
	type PreparedRecord,
	prepareRecord,
	setSourceLicense,
	type Sql,
	startCrawl,
	withdrawAbsentRecords,
} from '@prodid/store'

const SPEC = new URL('../../../../spec/', import.meta.url)
export const ITEMS = new URL('examples/items.ndjson', SPEC).pathname
export const MERCHANT = new URL('fixtures/merchant/feed.ndjson', SPEC).pathname

export interface FeedCrawl {
	name: string
	kind: SourceKind
	feed: string
	license: string | null
	lines: string[]
	now: Date
}

export async function feedLines(path: string): Promise<string[]> {
	return (await Bun.file(path).text()).split('\n').filter((line) => line.trim() !== '')
}

/** One crawl of one feed through the store calls the index's crawler makes, in its order. */
export async function crawlFeed(sql: Sql, input: FeedCrawl): Promise<{ seen: number; changed: number }> {
	const source = await findOrCreateSource(sql, { kind: input.kind, name: input.name }, input.now)
	const crawl = await startCrawl(sql, { source: source.id, via: null, documentUrl: null, startedAt: input.now })
	await ensureFeeds(sql, source.id, [input.feed])
	await setSourceLicense(sql, source.id, input.license)
	const records: PreparedRecord[] = []
	for await (const entry of readNdjson(new Response(input.lines.join('\n')).body!)) {
		if (!entry.ok) throw new Error(entry.error)
		const item = validateItem(entry.value)
		if (!item.ok) throw new Error(JSON.stringify(item.errors))
		const prepared = await prepareRecord(item.value, source.id)
		if (!prepared.ok) throw new Error(prepared.error)
		records.push(prepared.prepared)
	}
	const result = await ingestRecords(sql, { source: source.id, feed: input.feed, records, now: input.now })
	await accumulateCrawl(sql, { crawl, recordsSeen: result.seen, recordsChanged: result.changed })
	const gone = await withdrawAbsentRecords(sql, { source: source.id, feed: input.feed, seenKeys: result.keys, now: input.now })
	await finishCrawl(sql, {
		crawl,
		source: source.id,
		outcome: result.changed > 0 || gone.records > 0 ? 'changed' : 'unchanged',
		httpStatus: 200,
		finishedAt: input.now,
	})
	return { seen: result.seen, changed: result.changed }
}

export const ACME = { name: 'acme.example', kind: 'domain', feed: 'https://acme.example/items.ndjson', license: 'CC-BY-4.0' } as const
export const CANARY = {
	name: 'canary.prodid.org',
	kind: 'hosted',
	feed: 'https://canary.prodid.org/feeds/items.ndjson',
	license: 'CC0-1.0',
} as const

/**
 * The spec's example feed and its Merchant fixture, crawled as two sources that share items, a
 * second crawl that withdraws one record, and a merge.
 */
export async function populate(sql: Sql, at: Date): Promise<void> {
	const hour = 3_600_000
	const items = await feedLines(ITEMS)
	await crawlFeed(sql, { ...ACME, lines: items, now: at })
	await crawlFeed(sql, { ...CANARY, lines: await feedLines(MERCHANT), now: new Date(at.getTime() + hour) })
	await crawlFeed(sql, { ...ACME, lines: items.slice(0, -1), now: new Date(at.getTime() + 2 * hour) })
	const [from, into] = await sql<{ opid: string }[]>`
		select r.opid from record r join source s on s.id = r.source
		where s.name = ${ACME.name} and r.withdrawn_at is null order by r.key limit 2
	`
	await mergeEntities(sql, {
		from: from!.opid,
		into: into!.opid,
		reason: 'test',
		decidedBy: 'test',
		now: new Date(at.getTime() + 3 * hour),
	})
}

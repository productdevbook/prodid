import type { EntityRecord, ItemRecord, SourceRecord } from '@prodid/core'

import type { Sql, TransactionSql } from './client'
import type { FamilyKey, VariantKey } from './prepare'
import { buildEntities, type EntityRow, readSourceStatusPage } from './read'

export type DumpFile = 'sources.ndjson.gz' | 'entities.ndjson.gz' | 'records.ndjson.gz' | 'groupings.ndjson.gz' | 'merges.ndjson.gz'

export const DUMP_FILES: readonly DumpFile[] = [
	'sources.ndjson.gz',
	'entities.ndjson.gz',
	'records.ndjson.gz',
	'groupings.ndjson.gz',
	'merges.ndjson.gz',
]

/** `/id/{opid}?history=1`'s document; a merged opid's is the one it would answer unmerged, plus its survivor. */
export type EntityLine = EntityRecord & { merged_into?: string }

export interface RecordLine {
	source: string
	key: string
	feed?: string
	opid: string
	body: ItemRecord
	first_seen: string
	last_seen: string
	withdrawn_at?: string
}

export type { FamilyKey, VariantKey } from './prepare'

export type GroupingLine =
	| { source: string; kind: 'family'; key: FamilyKey; opid: string }
	| { source: string; kind: 'variant'; key: VariantKey; opid: string }

export interface MergeLine {
	from: string
	into: string
	decided_at: string
	reverted_at?: string
}

export interface DumpSnapshot {
	/** The moment the snapshot every iterator reads was taken. */
	snapshotAt: Date
	sources(): AsyncGenerator<SourceRecord>
	entities(): AsyncGenerator<EntityLine>
	records(): AsyncGenerator<RecordLine>
	groupings(): AsyncGenerator<GroupingLine>
	/** Groupings older than their written-out key that no record still produces: left out of `groupings()`, counted here. */
	groupingsWithoutKey(): Promise<number>
	merges(): AsyncGenerator<MergeLine>
}

export const DUMP_PAGE = 1000

/**
 * Opens one `repeatable read` transaction and hands `run` iterators over the five dump files, all
 * reading the same snapshot, so they agree with each other however long the dump takes. Each one
 * pages by key, so neither side ever holds more than a page; they are only valid until `run` settles.
 */
export async function readSnapshot<T>(sql: Sql, run: (snapshot: DumpSnapshot) => Promise<T>, options: { page?: number } = {}): Promise<T> {
	const page = options.page ?? DUMP_PAGE
	return (await sql.begin('isolation level repeatable read', async (tx) => {
		// The first statement takes the snapshot, so its own timestamp is the snapshot's.
		const [taken] = await tx<{ at: Date }[]>`select statement_timestamp() as at`
		return await run({
			snapshotAt: taken!.at,
			sources: () => sources(tx, page),
			entities: () => entities(tx, page),
			records: () => records(tx, page),
			groupings: () => groupings(tx, page),
			groupingsWithoutKey: async () =>
				(await tx<{ count: number }[]>`select count(*)::int as count from grouping where written_key is null`)[0]!.count,
			merges: () => merges(tx, page),
		})
	})) as T
}

async function* sources(tx: TransactionSql, page: number): AsyncGenerator<SourceRecord> {
	let after: string | null = null
	for (;;) {
		const statuses = await readSourceStatusPage(tx, after, page)
		yield* statuses
		if (statuses.length < page) return
		after = statuses.at(-1)!.name
	}
}

async function* entities(tx: TransactionSql, page: number): AsyncGenerator<EntityLine> {
	let after = ''
	for (;;) {
		const rows = await tx<EntityRow[]>`
			select opid, kind, parent, merged_into from entity where opid > ${after} order by opid limit ${page}
		`
		const documents = await buildEntities(tx, rows, { history: true })
		for (const [index, document] of documents.entries()) {
			const survivor = rows[index]!.merged_into
			yield survivor === null ? document : { ...document, merged_into: survivor }
		}
		if (rows.length < page) return
		after = rows.at(-1)!.opid
	}
}

interface RecordRow {
	source: string
	source_name: string
	key: string
	feed: string | null
	opid: string
	body: string
	first_seen: Date
	last_seen: Date
	withdrawn_at: Date | null
}

async function* recordRows(tx: TransactionSql, page: number): AsyncGenerator<RecordRow[]> {
	let after: { source: string; key: string } | null = null
	for (;;) {
		const rows: RecordRow[] = await tx<RecordRow[]>`
			select r.source::text, s.name as source_name, r.key, r.feed, r.opid, r.body::text as body,
				r.first_seen, r.last_seen, r.withdrawn_at
			from record r
			join source s on s.id = r.source
			${after === null ? tx`` : tx`where (r.source, r.key) > (${after.source}::bigint, ${after.key})`}
			order by r.source, r.key
			limit ${page}
		`
		yield rows
		if (rows.length < page) return
		const last = rows.at(-1)!
		after = { source: last.source, key: last.key }
	}
}

async function* records(tx: TransactionSql, page: number): AsyncGenerator<RecordLine> {
	for await (const rows of recordRows(tx, page)) {
		for (const row of rows) {
			yield {
				source: row.source_name,
				key: row.key,
				...(row.feed === null ? {} : { feed: row.feed }),
				opid: row.opid,
				body: JSON.parse(row.body) as ItemRecord,
				first_seen: row.first_seen.toISOString(),
				last_seen: row.last_seen.toISOString(),
				...(row.withdrawn_at === null ? {} : { withdrawn_at: row.withdrawn_at.toISOString() }),
			}
		}
	}
}

interface GroupingRow {
	source: string
	source_name: string
	kind: 'family' | 'variant'
	key: string
	written: string
	opid: string
}

async function* groupings(tx: TransactionSql, page: number): AsyncGenerator<GroupingLine> {
	let after: { source: string; kind: string; key: string } | null = null
	for (;;) {
		const rows: GroupingRow[] = await tx<GroupingRow[]>`
			select g.source::text, s.name as source_name, g.kind, g.key, g.written_key::text as written, g.opid
			from grouping g
			join source s on s.id = g.source
			where g.written_key is not null
				${after === null ? tx`` : tx`and (g.source, g.kind, g.key) > (${after.source}::bigint, ${after.kind}, ${after.key})`}
			order by g.source, g.kind, g.key
			limit ${page}
		`
		for (const row of rows) {
			yield { source: row.source_name, kind: row.kind, key: JSON.parse(row.written), opid: row.opid } as GroupingLine
		}
		if (rows.length < page) return
		const last = rows.at(-1)!
		after = { source: last.source, kind: last.kind, key: last.key }
	}
}

async function* merges(tx: TransactionSql, page: number): AsyncGenerator<MergeLine> {
	let after = '0'
	for (;;) {
		const rows = await tx<{ id: string; from_opid: string; into_opid: string; decided_at: Date; reverted_at: Date | null }[]>`
			select id::text, from_opid, into_opid, decided_at, reverted_at
			from merge where id > ${after}::bigint order by id limit ${page}
		`
		for (const row of rows) {
			const line: MergeLine = { from: row.from_opid, into: row.into_opid, decided_at: row.decided_at.toISOString() }
			if (row.reverted_at !== null) line.reverted_at = row.reverted_at.toISOString()
			yield line
		}
		if (rows.length < page) return
		after = rows.at(-1)!.id
	}
}

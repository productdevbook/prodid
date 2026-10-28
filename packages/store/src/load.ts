import {
	canonicalize,
	type CrawlStatus,
	type EntityRecord,
	groupingDigests,
	isOpid,
	type ItemRecord,
	type SourceRecord,
	validateEntity,
	validateItem,
	validateSource,
} from '@prodid/core'

import type { Sql, TransactionSql } from './client'
import { DUMP_PAGE, type DumpFile, type FamilyKey } from './dump'
import { prepareRecord } from './prepare'
import type { CrawlOutcome } from './source'

/** The parsed lines of each dump file, read in the order the files are listed here. */
export interface DumpLines {
	sources: AsyncIterable<unknown> | Iterable<unknown>
	entities: AsyncIterable<unknown> | Iterable<unknown>
	records: AsyncIterable<unknown> | Iterable<unknown>
	groupings: AsyncIterable<unknown> | Iterable<unknown>
	merges: AsyncIterable<unknown> | Iterable<unknown>
}

export interface LoadOptions {
	/** Who ran the load. A dump does not say who decided a merge, and the index requires someone. */
	operator: string
	now?: Date
	page?: number
}

export interface LoadResult {
	sources: number
	entities: number
	records: number
	groupings: number
	merges: number
}

export class DumpError extends Error {
	constructor(
		readonly file: DumpFile | null,
		readonly line: number | null,
		message: string,
	) {
		super(file === null ? message : `${file}:${line}: ${message}`)
		this.name = 'DumpError'
	}
}

export const LOADED_MERGE_REASON = 'loaded from a dump'

const TABLES = ['source', 'feed', 'crawl', 'entity', 'grouping', 'merge', 'identifier', 'record', 'claim', 'media'] as const

/**
 * Loads a dump into an empty, migrated index in one transaction, so a load that fails leaves the
 * database empty. Sources get new ids; every `opid` is kept. The index's digests and `sku`/`rcn`
 * scopes embed the source id, so they are derived here again from the written-out grouping keys and
 * the record bodies, the way ingest derives them, and a crawl afterwards finds what it wrote.
 */
export async function loadDump(sql: Sql, dump: DumpLines, options: LoadOptions): Promise<LoadResult> {
	if (options.operator.trim() === '') throw new DumpError(null, null, 'an operator is required')
	const now = options.now ?? new Date()
	const page = options.page ?? DUMP_PAGE
	return (await sql.begin(async (tx) => {
		await tx.unsafe(`lock table ${TABLES.join(', ')} in exclusive mode`)
		const used = await tx.unsafe<{ name: string }[]>(
			TABLES.map((table) => `select '${table}' as name where exists (select 1 from ${table})`).join(' union all '),
		)
		if (used.length > 0) throw new DumpError(null, null, `the database is not empty: ${used.map((row) => row.name).join(', ')}`)
		await stagingTables(tx)

		const ids = new Map<string, string>()
		const result: LoadResult = { sources: 0, entities: 0, records: 0, groupings: 0, merges: 0 }
		result.sources = await loadSources(tx, dump.sources, ids, now)
		result.entities = await stage(dump.entities, 'entities.ndjson.gz', page, (lines) => stageEntities(tx, lines, ids))
		result.records = await stage(dump.records, 'records.ndjson.gz', page, (lines) => stageRecords(tx, lines, ids))
		result.groupings = await stage(dump.groupings, 'groupings.ndjson.gz', page, (lines) => stageGroupings(tx, lines, ids))
		result.merges = await stage(dump.merges, 'merges.ndjson.gz', page, (lines) => stageMerges(tx, lines))
		await settle(tx, options.operator, now)
		return result
	})) as LoadResult
}

type Numbered = { line: number; value: unknown }

async function stage(
	lines: AsyncIterable<unknown> | Iterable<unknown>,
	file: DumpFile,
	page: number,
	write: (batch: Numbered[]) => Promise<void>,
): Promise<number> {
	let batch: Numbered[] = []
	let count = 0
	try {
		for await (const value of lines) {
			count += 1
			batch.push({ line: count, value })
			if (batch.length >= page) {
				await write(batch)
				batch = []
			}
		}
		if (batch.length > 0) await write(batch)
	} catch (error) {
		if (error instanceof LineError) throw new DumpError(file, error.line, error.message)
		throw error
	}
	return count
}

class LineError extends Error {
	constructor(
		readonly line: number,
		message: string,
	) {
		super(message)
	}
}

async function stagingTables(tx: TransactionSql): Promise<void> {
	await tx.unsafe(`
		create temporary table dump_entity (
			opid text primary key, line int not null, kind text not null, parent text, merged_into text
		) on commit drop;
		create temporary table dump_identifier (
			line_opid text not null, scheme text not null, scope text not null, value text not null
		) on commit drop;
		create temporary table dump_claim (
			line_opid text not null, n int not null, property text not null, value text not null, lang text,
			source bigint not null, seen_at timestamptz not null, withdrawn_at timestamptz
		) on commit drop;
		create temporary table dump_record (
			source bigint not null, key text not null, feed text, opid text not null, hash text not null, body text not null,
			first_seen timestamptz not null, last_seen timestamptz not null, withdrawn_at timestamptz,
			primary key (source, key)
		) on commit drop;
		create temporary table dump_record_claim (
			source bigint not null, key text not null, opid text not null, live boolean not null,
			property text not null, lang text, value text not null
		) on commit drop;
		create temporary table dump_record_media (
			source bigint not null, key text not null, opid text not null, live boolean not null,
			url text not null, license text not null, kind text not null
		) on commit drop;
		create temporary table dump_record_identifier (
			source bigint not null, scheme text not null, scope text not null, value text not null, first_seen timestamptz not null
		) on commit drop;
		create temporary table dump_grouping (
			source bigint not null, kind text not null, key text not null, opid text not null
		) on commit drop;
		create temporary table dump_merge (
			n int not null, from_opid text not null, into_opid text not null, decided_at timestamptz not null, reverted_at timestamptz
		) on commit drop;
		create temporary table dump_own_claim (
			n bigint generated always as identity primary key, opid text not null, property text not null, value text not null,
			lang text, source bigint not null, seen_at timestamptz not null, withdrawn_at timestamptz, record_key text
		) on commit drop;
	`)
}

async function loadSources(
	tx: TransactionSql,
	lines: AsyncIterable<unknown> | Iterable<unknown>,
	ids: Map<string, string>,
	now: Date,
): Promise<number> {
	let count = 0
	for await (const value of lines) {
		count += 1
		const valid = validateSource(value)
		if (!valid.ok) throw new DumpError('sources.ndjson.gz', count, `not an org.prodid.source: ${JSON.stringify(valid.errors[0])}`)
		const status = value as SourceRecord
		if (ids.has(status.name)) throw new DumpError('sources.ndjson.gz', count, `${status.name} appears twice`)
		ids.set(status.name, await insertSource(tx, status, now))
	}
	return count
}

/**
 * A source above `unverified` must name the successful crawl that proved it. The dump carries the
 * last crawl as the status shows it; when that crawl was not a success, the proof is a crawl row at
 * the verification time, written first so the last crawl stays the one the status reports.
 */
async function insertSource(tx: TransactionSql, status: SourceRecord, now: Date): Promise<string> {
	const last = status.last_crawl
	const [row] = await tx<{ id: string }[]>`
		insert into source (kind, name, license, lapsed_at, last_crawled_at, created_at)
		values (${status.kind}, ${status.name}, ${status.license ?? null}, ${status.lapsed_at ?? null}, ${last?.at ?? null}, ${now})
		returning id::text
	`
	const id = row!.id
	if (status.trust === 'unverified' || status.verified_by === undefined || status.verified_at === undefined) {
		if (last !== undefined) await insertCrawl(tx, id, last)
		return id
	}

	let proof: string
	if (last !== undefined && last.outcome === 'success') {
		proof = await insertCrawl(tx, id, last)
	} else {
		const at = last !== undefined && Date.parse(last.at) < Date.parse(status.verified_at) ? last.at : status.verified_at
		proof = await insertCrawl(tx, id, { at, via: status.verified_by, outcome: 'success' })
		if (last !== undefined) await insertCrawl(tx, id, last)
	}
	// A dump carries no grant, so a source that was authoritative loads as verified.
	await tx`
		update source set
			trust = 'verified',
			verified_by = ${status.verified_by},
			verified_at = ${status.verified_at},
			verified_crawl = ${proof},
			feed_host = ${delegatedHost(status)}
		where id = ${id}
	`
	return id
}

/** The status shows a document URL only on the host the source is verified at, so that host is the one it names. */
function delegatedHost(status: SourceRecord): string | null {
	const url = status.last_crawl?.document_url
	if (url === undefined) return null
	const host = new URL(url).hostname
	return host === status.name ? null : host
}

function internalOutcome(crawl: CrawlStatus): CrawlOutcome {
	if (crawl.outcome === 'success') return (crawl.records_changed ?? 0) > 0 ? 'changed' : 'unchanged'
	if (crawl.outcome === 'definite-negative') return crawl.via === undefined ? 'no-discovery' : 'rejected'
	return 'fetch-failed'
}

async function insertCrawl(tx: TransactionSql, source: string, crawl: CrawlStatus): Promise<string> {
	const [row] = await tx<{ id: string }[]>`
		insert into crawl (
			source, via, document_url, started_at, finished_at, outcome, http_status,
			records_seen, records_changed, lines_skipped, feeds_failed, media_failed
		) values (
			${source}, ${crawl.via ?? null}, ${crawl.document_url ?? null}, ${crawl.at}, ${crawl.at}, ${internalOutcome(crawl)},
			${crawl.http_status ?? null}, ${crawl.records_seen ?? null}, ${crawl.records_changed ?? null},
			${crawl.lines_skipped ?? null}, ${crawl.feeds_failed ?? null}, ${crawl.media_failed ?? 0}
		)
		returning id::text
	`
	return row!.id
}

function sourceId(ids: ReadonlyMap<string, string>, name: unknown, line: number): string {
	const id = typeof name === 'string' ? ids.get(name) : undefined
	if (id === undefined) throw new LineError(line, `names a source with no line in sources.ndjson.gz: ${JSON.stringify(name)}`)
	return id
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function timestamp(value: unknown, line: number, field: string): string {
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new LineError(line, `${field} is not a time`)
	return value
}

function optionalTimestamp(value: unknown, line: number, field: string): string | null {
	return value === undefined ? null : timestamp(value, line, field)
}

function opidOf(value: unknown, line: number, field: string): string {
	if (typeof value !== 'string' || !isOpid(value)) throw new LineError(line, `${field} is not an opid`)
	return value
}

async function stageEntities(tx: TransactionSql, lines: Numbered[], ids: ReadonlyMap<string, string>): Promise<void> {
	const entities: { opid: string; line: number; kind: string; parent: string | null; merged_into: string | null }[] = []
	const identifiers: { line_opid: string; scheme: string; scope: string; value: string }[] = []
	const claims: {
		line_opid: string
		n: number
		property: string
		value: string
		lang: string | null
		source: string
		seen_at: string
		withdrawn_at: string | null
	}[] = []
	for (const { line, value } of lines) {
		if (!isObject(value)) throw new LineError(line, 'not an object')
		const { merged_into, ...document } = value
		const valid = validateEntity(document)
		if (!valid.ok) throw new LineError(line, `not an org.prodid.entity: ${JSON.stringify(valid.errors[0])}`)
		const entity = document as unknown as EntityRecord
		const survivor = merged_into === undefined ? null : opidOf(merged_into, line, 'merged_into')
		const parent = entity.kind === 'item' ? entity.parents?.variant : entity.kind === 'variant' ? entity.parents?.family : undefined
		entities.push({ opid: entity.opid, line, kind: entity.kind, parent: parent ?? null, merged_into: survivor })
		for (const identifier of entity.identifiers) {
			const scope =
				identifier.scheme === 'sku' || identifier.scheme === 'rcn' ? sourceId(ids, identifier.scope, line) : (identifier.scope ?? '')
			identifiers.push({ line_opid: entity.opid, scheme: identifier.scheme, scope, value: identifier.value })
		}
		for (const [n, claim] of entity.claims.entries()) {
			claims.push({
				line_opid: entity.opid,
				n,
				property: claim.property,
				value: canonicalize(claim.value),
				lang: claim.lang ?? null,
				source: sourceId(ids, claim.source.name, line),
				seen_at: claim.seen_at,
				withdrawn_at: claim.withdrawn_at ?? null,
			})
		}
	}
	await tx`
		insert into dump_entity (opid, line, kind, parent, merged_into)
		select * from unnest(
			${entities.map((row) => row.opid)}::text[], ${entities.map((row) => row.line)}::int[],
			${entities.map((row) => row.kind)}::text[], ${entities.map((row) => row.parent)}::text[],
			${entities.map((row) => row.merged_into)}::text[]
		)
	`
	if (identifiers.length > 0) {
		await tx`
			insert into dump_identifier (line_opid, scheme, scope, value)
			select * from unnest(
				${identifiers.map((row) => row.line_opid)}::text[], ${identifiers.map((row) => row.scheme)}::text[],
				${identifiers.map((row) => row.scope)}::text[], ${identifiers.map((row) => row.value)}::text[]
			)
		`
	}
	if (claims.length > 0) {
		await tx`
			insert into dump_claim (line_opid, n, property, value, lang, source, seen_at, withdrawn_at)
			select * from unnest(
				${claims.map((row) => row.line_opid)}::text[], ${claims.map((row) => row.n)}::int[],
				${claims.map((row) => row.property)}::text[], ${claims.map((row) => row.value)}::text[],
				${claims.map((row) => row.lang)}::text[], ${claims.map((row) => row.source)}::bigint[],
				${claims.map((row) => row.seen_at)}::timestamptz[], ${claims.map((row) => row.withdrawn_at)}::timestamptz[]
			)
		`
	}
}

async function stageRecords(tx: TransactionSql, lines: Numbered[], ids: ReadonlyMap<string, string>): Promise<void> {
	const records: {
		source: string
		key: string
		feed: string | null
		opid: string
		hash: string
		body: string
		first_seen: string
		last_seen: string
		withdrawn_at: string | null
	}[] = []
	const claims: { source: string; key: string; opid: string; live: boolean; property: string; lang: string | null; value: string }[] = []
	const media: { source: string; key: string; opid: string; live: boolean; url: string; license: string; kind: string }[] = []
	const identifiers: { source: string; scheme: string; scope: string; value: string; first_seen: string }[] = []
	for (const { line, value } of lines) {
		if (!isObject(value)) throw new LineError(line, 'not an object')
		const source = sourceId(ids, value.source, line)
		if (typeof value.key !== 'string' || value.key === '') throw new LineError(line, 'key is not a string')
		if (value.feed !== undefined && typeof value.feed !== 'string') throw new LineError(line, 'feed is not a string')
		const valid = validateItem(value.body)
		if (!valid.ok) throw new LineError(line, `body is not an org.prodid.item: ${JSON.stringify(valid.errors[0])}`)
		const body = value.body as ItemRecord
		if (body.key !== value.key) throw new LineError(line, 'key is not the body’s key')
		const prepared = await prepareRecord(body, source)
		if (!prepared.ok) throw new LineError(line, `body cannot be ingested: ${prepared.error}`)
		const opid = opidOf(value.opid, line, 'opid')
		const firstSeen = timestamp(value.first_seen, line, 'first_seen')
		const withdrawnAt = optionalTimestamp(value.withdrawn_at, line, 'withdrawn_at')
		const live = withdrawnAt === null
		records.push({
			source,
			key: value.key,
			feed: (value.feed as string | undefined) ?? null,
			opid,
			hash: prepared.prepared.hash,
			body: prepared.prepared.canonical,
			first_seen: firstSeen,
			last_seen: timestamp(value.last_seen, line, 'last_seen'),
			withdrawn_at: withdrawnAt,
		})
		const distinct = new Map(
			prepared.prepared.claims.map((claim) => [`${claim.property}\u0000${claim.lang}\u0000${claim.canonical}`, claim]),
		)
		for (const claim of distinct.values()) {
			claims.push({ source, key: value.key, opid, live, property: claim.property, lang: claim.lang, value: claim.canonical })
		}
		for (const entry of prepared.prepared.media) {
			media.push({ source, key: value.key, opid, live, url: entry.url, license: entry.license, kind: entry.kind ?? '' })
		}
		for (const identifier of prepared.prepared.identifiers) {
			identifiers.push({ source, scheme: identifier.scheme, scope: identifier.scope, value: identifier.value, first_seen: firstSeen })
		}
	}
	await tx`
		insert into dump_record (source, key, feed, opid, hash, body, first_seen, last_seen, withdrawn_at)
		select * from unnest(
			${records.map((row) => row.source)}::bigint[], ${records.map((row) => row.key)}::text[],
			${records.map((row) => row.feed)}::text[], ${records.map((row) => row.opid)}::text[],
			${records.map((row) => row.hash)}::text[], ${records.map((row) => row.body)}::text[],
			${records.map((row) => row.first_seen)}::timestamptz[], ${records.map((row) => row.last_seen)}::timestamptz[],
			${records.map((row) => row.withdrawn_at)}::timestamptz[]
		)
	`
	if (claims.length > 0) {
		await tx`
			insert into dump_record_claim (source, key, opid, live, property, lang, value)
			select * from unnest(
				${claims.map((row) => row.source)}::bigint[], ${claims.map((row) => row.key)}::text[],
				${claims.map((row) => row.opid)}::text[], ${claims.map((row) => String(row.live))}::text[]::boolean[],
				${claims.map((row) => row.property)}::text[], ${claims.map((row) => row.lang)}::text[],
				${claims.map((row) => row.value)}::text[]
			)
		`
	}
	if (media.length > 0) {
		await tx`
			insert into dump_record_media (source, key, opid, live, url, license, kind)
			select * from unnest(
				${media.map((row) => row.source)}::bigint[], ${media.map((row) => row.key)}::text[],
				${media.map((row) => row.opid)}::text[], ${media.map((row) => String(row.live))}::text[]::boolean[],
				${media.map((row) => row.url)}::text[], ${media.map((row) => row.license)}::text[],
				${media.map((row) => row.kind)}::text[]
			)
		`
	}
	if (identifiers.length > 0) {
		await tx`
			insert into dump_record_identifier (source, scheme, scope, value, first_seen)
			select * from unnest(
				${identifiers.map((row) => row.source)}::bigint[], ${identifiers.map((row) => row.scheme)}::text[],
				${identifiers.map((row) => row.scope)}::text[], ${identifiers.map((row) => row.value)}::text[],
				${identifiers.map((row) => row.first_seen)}::timestamptz[]
			)
		`
	}
}

function familyKey(value: unknown, line: number): FamilyKey {
	if (isObject(value)) {
		const keys = Object.keys(value)
		if (keys.length === 1 && keys[0] === 'group' && typeof value.group === 'string') return { group: value.group }
		if (keys.length === 1 && keys[0] === 'key' && typeof value.key === 'string') return { key: value.key }
	}
	throw new LineError(line, 'a family key is { "group" } or { "key" }')
}

/**
 * The digest is core's, of the key a record with this grouping would produce: core reads only the
 * grouping members of a record, so a record carrying nothing else derives exactly that key.
 */
function groupedRecord(kind: unknown, key: unknown, line: number): ItemRecord {
	let family: FamilyKey
	let variant: Record<string, string> | undefined
	if (kind === 'family') {
		family = familyKey(key, line)
	} else if (kind === 'variant') {
		if (!isObject(key) || Object.keys(key).length !== 2 || !isObject(key.variant)) {
			throw new LineError(line, 'a variant key is { "family", "variant" }')
		}
		family = familyKey(key.family, line)
		const axes = key.variant
		if (!Object.values(axes).every((axis) => typeof axis === 'string')) throw new LineError(line, 'a variant axis is not a string')
		variant = axes as Record<string, string>
	} else {
		throw new LineError(line, 'kind is neither family nor variant')
	}
	const record: ItemRecord = { $type: 'org.prodid.item', key: 'key' in family ? family.key : '', brand: '', name: '', identifiers: [] }
	if ('group' in family) record.group = family.group
	if (variant !== undefined) record.variant = variant
	return record
}

async function stageGroupings(tx: TransactionSql, lines: Numbered[], ids: ReadonlyMap<string, string>): Promise<void> {
	const rows = await Promise.all(
		lines.map(async ({ line, value }) => {
			if (!isObject(value)) throw new LineError(line, 'not an object')
			const source = sourceId(ids, value.source, line)
			const record = groupedRecord(value.kind, value.key, line)
			const digests = await groupingDigests(record, { source })
			const kind = value.kind as 'family' | 'variant'
			return { source, kind, key: digests[kind], opid: opidOf(value.opid, line, 'opid') }
		}),
	)
	await tx`
		insert into dump_grouping (source, kind, key, opid)
		select * from unnest(
			${rows.map((row) => row.source)}::bigint[], ${rows.map((row) => row.kind)}::text[],
			${rows.map((row) => row.key)}::text[], ${rows.map((row) => row.opid)}::text[]
		)
	`
}

async function stageMerges(tx: TransactionSql, lines: Numbered[]): Promise<void> {
	const rows = lines.map(({ line, value }) => {
		if (!isObject(value)) throw new LineError(line, 'not an object')
		return {
			n: line,
			from: opidOf(value.from, line, 'from'),
			into: opidOf(value.into, line, 'into'),
			decided_at: timestamp(value.decided_at, line, 'decided_at'),
			reverted_at: optionalTimestamp(value.reverted_at, line, 'reverted_at'),
		}
	})
	await tx`
		insert into dump_merge (n, from_opid, into_opid, decided_at, reverted_at)
		select * from unnest(
			${rows.map((row) => row.n)}::int[], ${rows.map((row) => row.from)}::text[], ${rows.map((row) => row.into)}::text[],
			${rows.map((row) => row.decided_at)}::timestamptz[], ${rows.map((row) => row.reverted_at)}::timestamptz[]
		)
	`
}

/**
 * Moves the staged lines into the index. A survivor's line repeats the identifiers and claims of
 * every opid merged into it, which keep their own rows; each is given back to the merged opid whose
 * own line carries it, and claims are inserted in the order the lines list them, so the claim ids
 * that break ties in a read keep the order the source index had.
 */
async function settle(tx: TransactionSql, operator: string, now: Date): Promise<void> {
	for (const kind of ['family', 'variant', 'item']) {
		await tx`
			insert into entity (opid, kind, parent, created_at)
			select opid, kind, parent, ${now} from dump_entity where kind = ${kind} order by line
		`
	}
	await tx`
		update entity e set merged_into = d.merged_into
		from dump_entity d where d.opid = e.opid and d.merged_into is not null
	`
	await tx`
		insert into merge (from_opid, into_opid, reason, decided_by, decided_at, reverted_at)
		select from_opid, into_opid, ${LOADED_MERGE_REASON}, ${operator}, decided_at, reverted_at from dump_merge order by n
	`

	const [orphans] = await tx<{ count: number }[]>`
		select count(*)::int as count from dump_identifier m join dump_entity me on me.opid = m.line_opid
		where me.merged_into is not null and not exists (
			select 1 from dump_identifier s
			where s.line_opid = me.merged_into and s.scheme = m.scheme and s.scope = m.scope and s.value = m.value
		)
	`
	if (orphans!.count > 0) {
		throw new DumpError('entities.ndjson.gz', null, 'a merged entity has identifiers its survivor’s line does not carry')
	}

	await tx`create index on dump_record_identifier (scheme, scope, value, first_seen)`
	await tx`create index on dump_record (opid, first_seen)`
	await tx`
		insert into identifier (scheme, scope, value, opid, first_source, first_seen)
		select d.scheme, d.scope, d.value, o.opid,
			coalesce(f.source, r.source, c.source), coalesce(f.first_seen, r.first_seen, ${now})
		from dump_identifier d
		join dump_entity e on e.opid = d.line_opid and e.merged_into is null
		cross join lateral (
			select coalesce((
				select m.line_opid from dump_identifier m join dump_entity me on me.opid = m.line_opid
				where me.merged_into = d.line_opid and m.scheme = d.scheme and m.scope = d.scope and m.value = d.value
				limit 1
			), d.line_opid) as opid
		) o
		left join lateral (
			select source, first_seen from dump_record_identifier f
			where f.scheme = d.scheme and f.scope = d.scope and f.value = d.value
			order by first_seen, source limit 1
		) f on true
		left join lateral (
			select source, first_seen from dump_record r where r.opid = o.opid order by first_seen, source limit 1
		) r on true
		left join lateral (
			select source from dump_claim c where c.line_opid = d.line_opid order by seen_at limit 1
		) c on true
	`

	await tx`
		insert into feed (source, url)
		select distinct source, feed from dump_record where feed is not null
	`
	await tx`
		insert into record (source, key, feed, opid, hash, body, first_seen, last_seen, withdrawn_at)
		select source, key, feed, opid, hash, body::jsonb, first_seen, last_seen, withdrawn_at from dump_record
	`

	await tx`
		with s as (
			select c.line_opid, c.n, c.property, c.value, c.lang, c.source, c.seen_at, c.withdrawn_at,
				row_number() over (
					partition by c.line_opid, c.property, c.value, c.lang, c.source, c.seen_at, c.withdrawn_at order by c.n
				) as k
			from dump_claim c join dump_entity e on e.opid = c.line_opid
			where e.merged_into is null
		), m as (
			select e.merged_into as line_opid, c.line_opid as owner, c.property, c.value, c.lang, c.source, c.seen_at, c.withdrawn_at,
				row_number() over (
					partition by e.merged_into, c.property, c.value, c.lang, c.source, c.seen_at, c.withdrawn_at order by c.line_opid, c.n
				) as k
			from dump_claim c join dump_entity e on e.opid = c.line_opid
			where e.merged_into is not null
		)
		insert into dump_own_claim (opid, property, value, lang, source, seen_at, withdrawn_at)
		select coalesce(m.owner, s.line_opid), s.property, s.value, s.lang, s.source, s.seen_at, s.withdrawn_at
		from s left join m on m.line_opid = s.line_opid and m.k = s.k
			and m.property = s.property and m.value = s.value and m.lang is not distinct from s.lang
			and m.source = s.source and m.seen_at = s.seen_at and m.withdrawn_at is not distinct from s.withdrawn_at
		order by s.line_opid, s.n
	`
	const [placed] = await tx<{ merged: number; owned: number }[]>`
		select
			(select count(*)::int from dump_claim c join dump_entity e on e.opid = c.line_opid where e.merged_into is not null) as merged,
			(select count(*)::int from dump_own_claim o join dump_entity e on e.opid = o.opid where e.merged_into is not null) as owned
	`
	if (placed!.merged !== placed!.owned) {
		throw new DumpError('entities.ndjson.gz', null, 'a merged entity has claims its survivor’s line does not carry')
	}

	// An active claim belongs to a live record of its source that resolves to the same opid and
	// still asserts it, which is what the next crawl's diff will look for.
	await tx`
		with a as (
			select n, source, opid, property, lang, value,
				row_number() over (partition by source, opid, property, lang, value order by n) as k
			from dump_own_claim where withdrawn_at is null and property <> 'media'
		), b as (
			select key, source, opid, property, lang, value,
				row_number() over (partition by source, opid, property, lang, value order by key) as k
			from dump_record_claim where live
		)
		update dump_own_claim o set record_key = b.key
		from a join b on b.source = a.source and b.opid = a.opid and b.property = a.property
			and b.lang is not distinct from a.lang and b.value = a.value and b.k = a.k
		where o.n = a.n
	`
	await tx`
		with a as (
			select n, source, opid, value::jsonb->>'url' as url, value::jsonb->>'license' as license,
				coalesce(value::jsonb->>'kind', '') as kind,
				row_number() over (
					partition by source, opid, value::jsonb->>'url', value::jsonb->>'license', coalesce(value::jsonb->>'kind', '') order by n
				) as k
			from dump_own_claim where withdrawn_at is null and property = 'media'
		), b as (
			select key, source, opid, url, license, kind,
				row_number() over (partition by source, opid, url, license, kind order by key) as k
			from (select distinct key, source, opid, url, license, kind from dump_record_media where live) d
		)
		update dump_own_claim o set record_key = b.key
		from a join b on b.source = a.source and b.opid = a.opid and b.url = a.url
			and b.license = a.license and b.kind = a.kind and b.k = a.k
		where o.n = a.n
	`
	await tx`
		update dump_own_claim o set record_key = (
			select key from dump_record r where r.source = o.source and r.opid = o.opid order by key limit 1
		)
		where withdrawn_at is not null
	`
	await tx`
		insert into claim (opid, property, value, lang, source, record_key, seen_at, withdrawn_at)
		select opid, property, value::jsonb, lang, source, record_key, seen_at, withdrawn_at from dump_own_claim order by n
	`

	await tx`insert into grouping (source, kind, key, opid) select source, kind, key, opid from dump_grouping`
}

import type {
	CrawlStatus,
	CrawlVia,
	EntityClaim,
	EntityIdentifier,
	EntityKind,
	EntityRecord,
	JsonValue,
	SourceKind,
	SourceRecord,
	Trust,
	VerifiedBy,
} from '@prodid/core'

import type { Sql, TransactionSql } from './client'

type Reader = Sql | TransactionSql
import { classifyOutcome, type CrawlOutcome } from './source'

export type EntityLookup =
	| { found: false }
	| { found: true; merged: true; survivor: string }
	| { found: true; merged: false; entity: EntityRecord }

export type GtinLookup = { found: false } | { found: true; opid: string; entity: EntityRecord }

export interface ReadOptions {
	/** Include withdrawn claims, each carrying `withdrawn_at`. */
	history?: boolean
}

export interface EntityRow {
	opid: string
	kind: EntityKind
	parent: string | null
	merged_into: string | null
}

interface ClaimRow {
	opid: string
	property: string
	/** `jsonb` as text: postgres.js decides for itself whether to parse a jsonb column, so this does. */
	value: string
	lang: string | null
	seen_at: Date
	withdrawn_at: Date | null
	source_name: string
	trust: Trust
	lapsed: boolean
}

export async function readEntity(sql: Sql, opid: string, options: ReadOptions = {}): Promise<EntityLookup> {
	const rows = await sql<EntityRow[]>`select opid, kind, parent, merged_into from entity where opid = ${opid}`
	const row = rows[0]
	if (row === undefined) return { found: false }
	if (row.merged_into !== null) return { found: true, merged: true, survivor: row.merged_into }
	return { found: true, merged: false, entity: await buildEntity(sql, row, options) }
}

/** The item a GTIN identifies, following `merged_into` so a merged opid still answers with the survivor. */
export async function readEntityByGtin(sql: Sql, value: string, options: ReadOptions = {}): Promise<GtinLookup> {
	const rows = await sql<EntityRow[]>`
		select t.opid, t.kind, t.parent, t.merged_into
		from identifier i
		join entity e on e.opid = i.opid
		join entity t on t.opid = coalesce(e.merged_into, i.opid)
		where i.scheme = 'gtin' and i.scope = '' and i.value = ${value}
	`
	const row = rows[0]
	if (row === undefined) return { found: false }
	return { found: true, opid: row.opid, entity: await buildEntity(sql, row, options) }
}

async function buildEntity(sql: Sql, row: EntityRow, options: ReadOptions): Promise<EntityRecord> {
	return (await buildEntities(sql, [row], options))[0]!
}

/**
 * The documents of several entities at once, each exactly as `readEntity` answers it alone. A row
 * that is itself merged is built as it would answer were it not merged: nothing is merged into it,
 * because merges do not chain.
 */
export async function buildEntities(sql: Reader, rows: readonly EntityRow[], options: ReadOptions): Promise<EntityRecord[]> {
	if (rows.length === 0) return []
	const page = rows.map((row) => row.opid)
	const mergedFrom = await sql<{ opid: string; merged_into: string }[]>`
		select opid, merged_into from entity where merged_into = any(${page}::text[]) order by opid
	`
	// Claims and identifiers are never repointed by a merge, so the survivor answers for the opids
	// that resolve to it as well as for its own.
	const members = new Map<string, string[]>(page.map((opid) => [opid, [opid]]))
	for (const entry of mergedFrom) members.get(entry.merged_into)!.push(entry.opid)
	const lines = new Map<string, string[]>()
	for (const [line, opids] of members) {
		for (const opid of opids) lines.set(opid, [...(lines.get(opid) ?? []), line])
	}
	const opids = [...lines.keys()]

	const [families, children, identifiers, claims] = await Promise.all([
		readFamilies(sql, rows),
		readChildren(sql, opids),
		readIdentifiers(sql, opids),
		readClaims(sql, opids, options.history === true),
	])
	const childrenOf = group(children, lines)
	const identifiersOf = group(identifiers, lines)
	const claimsOf = group(claims, lines)

	return rows.map((row) => {
		const entity: EntityRecord = {
			$type: 'org.prodid.entity',
			version: 1,
			opid: row.opid,
			kind: row.kind,
			identifiers: identifiersOf.get(row.opid) ?? [],
			claims: claimsOf.get(row.opid) ?? [],
		}
		const parents = parentsOf(row, families)
		if (parents !== null) entity.parents = parents
		const kids = childrenOf.get(row.opid) ?? []
		if (kids.length > 0) entity.children = kids
		const merged = members.get(row.opid)!.slice(1)
		if (merged.length > 0) entity.merged_from = merged
		return entity
	})
}

/** Spreads rows read for many opids over the documents they belong to, keeping the order they were read in. */
function group<T>(rows: readonly { opid: string; value: T }[], lines: ReadonlyMap<string, readonly string[]>): Map<string, T[]> {
	const grouped = new Map<string, T[]>()
	for (const row of rows) {
		for (const line of lines.get(row.opid) ?? []) {
			const list = grouped.get(line)
			if (list === undefined) grouped.set(line, [row.value])
			else list.push(row.value)
		}
	}
	return grouped
}

async function readFamilies(sql: Reader, rows: readonly EntityRow[]): Promise<Map<string, string | null>> {
	const variants = rows.filter((row) => row.kind === 'item' && row.parent !== null).map((row) => row.parent!)
	if (variants.length === 0) return new Map()
	const found = await sql<{ opid: string; parent: string | null }[]>`
		select opid, parent from entity where opid = any(${[...new Set(variants)]}::text[])
	`
	return new Map(found.map((entry) => [entry.opid, entry.parent]))
}

function parentsOf(row: EntityRow, families: ReadonlyMap<string, string | null>): { family?: string; variant?: string } | null {
	if (row.kind === 'family' || row.parent === null) return null
	if (row.kind === 'variant') return { family: row.parent }
	const family = families.get(row.parent)
	return family == null ? { variant: row.parent } : { family, variant: row.parent }
}

async function readChildren(sql: Reader, opids: readonly string[]): Promise<{ opid: string; value: string }[]> {
	const rows = await sql<{ opid: string; parent: string }[]>`
		select opid, parent from entity
		where parent = any(${opids as string[]}::text[]) and merged_into is null
		order by opid
	`
	return rows.map((entry) => ({ opid: entry.parent, value: entry.opid }))
}

/**
 * `sku` and `rcn` are scoped to the source's id inside the index; a reader is shown the source's
 * name instead, because the id is internal and means nothing outside.
 */
async function readIdentifiers(sql: Reader, opids: readonly string[]): Promise<{ opid: string; value: EntityIdentifier }[]> {
	const rows = await sql<{ opid: string; scheme: string; scope: string | null; value: string }[]>`
		select i.opid, i.scheme, i.value,
			case when i.scheme in ('sku','rcn') then s.name else nullif(i.scope, '') end as scope
		from identifier i
		left join lateral (
			select name from source where id = (case when i.scheme in ('sku','rcn') then i.scope end)::bigint
		) s on true
		where i.opid = any(${opids as string[]}::text[])
		order by i.scheme, i.scope, i.value
	`
	return rows.map((row) => ({
		opid: row.opid,
		value: row.scope == null ? { scheme: row.scheme, value: row.value } : { scheme: row.scheme, value: row.value, scope: row.scope },
	}))
}

async function readClaims(sql: Reader, opids: readonly string[], history: boolean): Promise<{ opid: string; value: EntityClaim }[]> {
	const rows = await sql<ClaimRow[]>`
		select c.opid, c.property, c.value::text as value, c.lang, c.seen_at, c.withdrawn_at,
			s.name as source_name, source_trust(s) as trust, (s.lapsed_at is not null) as lapsed
		from claim c
		join source s on s.id = c.source
		where c.opid = any(${opids as string[]}::text[]) ${history ? sql`` : sql`and c.withdrawn_at is null`}
		order by c.property, c.seen_at, c.id
	`
	return rows.map((row) => {
		const claim: EntityClaim = {
			property: row.property,
			value: JSON.parse(row.value) as JsonValue,
			source: { name: row.source_name, trust: row.trust, lapsed: row.lapsed },
			seen_at: row.seen_at.toISOString(),
		}
		if (row.lang !== null) claim.lang = row.lang
		if (row.withdrawn_at !== null) claim.withdrawn_at = row.withdrawn_at.toISOString()
		return { opid: row.opid, value: claim }
	})
}

interface SourceStatusRow {
	name: string
	kind: SourceKind
	trust: Trust
	verified_by: VerifiedBy | null
	verified_at: Date | null
	lapsed_at: Date | null
	license: string | null
	verified_host: string
	crawl_at: Date | null
	crawl_via: CrawlVia | null
	crawl_document_url: string | null
	crawl_outcome: CrawlOutcome | null
	crawl_http_status: number | null
	crawl_records_seen: number | null
	crawl_records_changed: number | null
	crawl_lines_skipped: number | null
	crawl_feeds_failed: number | null
	crawl_media_failed: number | null
}

/**
 * The public status of a source. The internal five-value outcome collapses to three, `error` never
 * leaves the index, and the URL and HTTP status are shown only for the host this source was last
 * verified at — otherwise pointing a throwaway domain at a host of your choosing and reading the
 * status back would tell you how that host answers the crawler.
 */
export async function readSourceStatus(sql: Sql, name: string): Promise<SourceRecord | null> {
	return (await readSourceStatuses(sql, { name }))[0] ?? null
}

/** Statuses in name order, each exactly as `readSourceStatus` answers it, for paging through every source. */
export async function readSourceStatusPage(sql: Reader, after: string | null, limit: number): Promise<SourceRecord[]> {
	return await readSourceStatuses(sql, { after, limit })
}

async function readSourceStatuses(
	sql: Reader,
	filter: { name: string } | { after: string | null; limit: number },
): Promise<SourceRecord[]> {
	const rows = await sql<SourceStatusRow[]>`
		select s.name, s.kind, source_trust(s) as trust, s.verified_by, s.verified_at, s.lapsed_at, s.license,
			coalesce(s.feed_host, s.name) as verified_host,
			c.finished_at as crawl_at, c.via as crawl_via, c.document_url as crawl_document_url,
			c.outcome as crawl_outcome, c.http_status as crawl_http_status,
			c.records_seen as crawl_records_seen, c.records_changed as crawl_records_changed,
			c.lines_skipped as crawl_lines_skipped, c.media_failed as crawl_media_failed,
			(
				select count(*)::int from feed f
				where f.source = s.id and c.started_at is not null and f.last_fetched_at >= c.started_at
					and (f.last_status is null or f.last_status not in (200, 304))
			) as crawl_feeds_failed
		from source s
		left join lateral (
			select * from crawl where source = s.id and finished_at is not null order by started_at desc, id desc limit 1
		) c on true
		${
			'name' in filter
				? sql`where s.name = ${filter.name}`
				: sql`where ${filter.after === null ? sql`true` : sql`s.name > ${filter.after}`} order by s.name limit ${filter.limit}`
		}
	`
	return rows.map(toStatus)
}

function toStatus(row: SourceStatusRow): SourceRecord {
	const status: SourceRecord = {
		$type: 'org.prodid.source',
		version: 1,
		name: row.name,
		kind: row.kind,
		trust: row.trust,
		lapsed: row.lapsed_at !== null,
	}
	if (row.verified_by !== null) status.verified_by = row.verified_by
	if (row.verified_at !== null) status.verified_at = row.verified_at.toISOString()
	if (row.lapsed_at !== null) status.lapsed_at = row.lapsed_at.toISOString()
	if (row.license !== null) status.license = row.license

	if (row.crawl_at !== null && row.crawl_outcome !== null) {
		// `media_failed` is in the spec's status; core's `CrawlStatus` is catching up.
		const crawl: CrawlStatus & { media_failed?: number } = {
			at: row.crawl_at.toISOString(),
			outcome: classifyOutcome(row.crawl_outcome),
		}
		if (row.crawl_via !== null) crawl.via = row.crawl_via
		// An import is not a fetch anyone can aim, so its export's URL is always shown and it has no status.
		if (row.crawl_via === 'import') {
			if (row.crawl_document_url !== null) crawl.document_url = row.crawl_document_url
		} else if (hostOf(row.crawl_document_url) === row.verified_host) {
			if (row.crawl_document_url !== null) crawl.document_url = row.crawl_document_url
			if (row.crawl_http_status !== null) crawl.http_status = row.crawl_http_status
		}
		if (row.crawl_records_seen !== null) crawl.records_seen = row.crawl_records_seen
		if (row.crawl_records_changed !== null) crawl.records_changed = row.crawl_records_changed
		if (row.crawl_lines_skipped !== null) crawl.lines_skipped = row.crawl_lines_skipped
		if (row.crawl_feeds_failed !== null) crawl.feeds_failed = row.crawl_feeds_failed
		if (row.crawl_media_failed !== null) crawl.media_failed = row.crawl_media_failed
		status.last_crawl = crawl
	}
	return status
}

function hostOf(url: string | null): string | null {
	if (url === null) return null
	try {
		return new URL(url).hostname
	} catch {
		return null
	}
}

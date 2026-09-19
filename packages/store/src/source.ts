import type { SourceKind, Trust, VerifiedBy } from '@prodid/core'

import type { Sql } from './client'
import { withRetry } from './client'

/** The internal outcome of one discovery run; the public status collapses it to three values. */
export type CrawlOutcome = 'changed' | 'unchanged' | 'no-discovery' | 'rejected' | 'fetch-failed'

export const DAY_MS = 86_400_000
export const LAPSE_AFTER_FAILING_MS = 7 * DAY_MS
export const WITHDRAW_AFTER_LAPSE_MS = 30 * DAY_MS
export const SKIPPING_GRACE_MS = 7 * DAY_MS

export interface SourceRow {
	id: string
	kind: SourceKind
	name: string
	trust: Trust
	verified_by: VerifiedBy | null
	verified_at: Date | null
	verified_crawl: string | null
	lapsed_at: Date | null
	failing_since: Date | null
	feed_host: string | null
	license: string | null
	last_crawled_at: Date | null
	created_at: Date
}

export interface FeedRow {
	source: string
	url: string
	etag: string | null
	last_modified: string | null
	last_fetched_at: Date | null
	last_status: number | null
	skipping_since: Date | null
}

const SOURCE_COLUMNS = `id::text, kind, name, trust, verified_by, verified_at, verified_crawl::text,
	lapsed_at, failing_since, feed_host, license, last_crawled_at, created_at`

export async function findSourceByName(sql: Sql, name: string): Promise<SourceRow | null> {
	const rows = await sql<SourceRow[]>`select ${sql.unsafe(SOURCE_COLUMNS)} from source where name = ${name}`
	return rows[0] ?? null
}

export async function findSourceById(sql: Sql, id: string): Promise<SourceRow | null> {
	const rows = await sql<SourceRow[]>`select ${sql.unsafe(SOURCE_COLUMNS)} from source where id = ${id}`
	return rows[0] ?? null
}

/**
 * The source row for an identity, created on first sight. `name` is unique, so two crawlers meeting
 * the same new domain race on it; the loser retries and finds the winner's row.
 */
export function findOrCreateSource(sql: Sql, identity: { kind: SourceKind; name: string }, now: Date): Promise<SourceRow> {
	return withRetry(async () => {
		const existing = await findSourceByName(sql, identity.name)
		if (existing !== null) return existing
		const rows = await sql<SourceRow[]>`
			insert into source (kind, name, created_at) values (${identity.kind}, ${identity.name}, ${now})
			returning ${sql.unsafe(SOURCE_COLUMNS)}
		`
		const created = rows[0]
		if (created === undefined) throw new Error(`source ${identity.name} was not created`)
		return created
	})
}

export async function startCrawl(
	sql: Sql,
	input: { source: string; via?: VerifiedBy | null; documentUrl?: string | null; startedAt: Date },
): Promise<string> {
	const rows = await sql<{ id: string }[]>`
		insert into crawl (source, via, document_url, started_at)
		values (${input.source}, ${input.via ?? null}, ${input.documentUrl ?? null}, ${input.startedAt})
		returning id::text
	`
	const created = rows[0]
	if (created === undefined) throw new Error('crawl insert returned no row')
	return created.id
}

export interface FinishCrawlInput {
	crawl: string
	source: string
	outcome: CrawlOutcome
	via?: VerifiedBy | null
	documentUrl?: string | null
	httpStatus?: number | null
	recordsSeen?: number | null
	recordsChanged?: number | null
	linesSkipped?: number | null
	error?: string | null
	finishedAt: Date
}

/**
 * Closes the crawl row and moves the source's lapse state with it, in one transaction: the outcome
 * and what it means for the source are the same fact and must not be observable apart.
 */
export function finishCrawl(sql: Sql, input: FinishCrawlInput): Promise<void> {
	const at = input.finishedAt
	const lapseCutoff = new Date(at.getTime() - LAPSE_AFTER_FAILING_MS)
	return sql.begin(async (tx) => {
		await tx`
			update crawl set
				finished_at = ${at},
				outcome = ${input.outcome},
				via = coalesce(${input.via ?? null}, via),
				document_url = coalesce(${input.documentUrl ?? null}, document_url),
				http_status = ${input.httpStatus ?? null},
				records_seen = ${input.recordsSeen ?? null},
				records_changed = ${input.recordsChanged ?? null},
				lines_skipped = ${input.linesSkipped ?? null},
				error = ${input.error ?? null}
			where id = ${input.crawl}
		`
		switch (classifyOutcome(input.outcome)) {
			case 'success':
				await tx`
					update source set last_crawled_at = ${at}, failing_since = null, lapsed_at = null
					where id = ${input.source}
				`
				return
			case 'definite-negative':
				await tx`
					update source set last_crawled_at = ${at}, failing_since = null, lapsed_at = coalesce(lapsed_at, ${at})
					where id = ${input.source}
				`
				return
			case 'transport-failure':
				await tx`
					update source set
						last_crawled_at = ${at},
						failing_since = coalesce(failing_since, ${at}),
						lapsed_at = case
							when coalesce(failing_since, ${at}) <= ${lapseCutoff} then coalesce(lapsed_at, ${at})
							else lapsed_at
						end
					where id = ${input.source}
				`
				return
		}
	})
}

export function classifyOutcome(outcome: CrawlOutcome): 'success' | 'definite-negative' | 'transport-failure' {
	switch (outcome) {
		case 'changed':
		case 'unchanged':
			return 'success'
		case 'no-discovery':
		case 'rejected':
			return 'definite-negative'
		case 'fetch-failed':
			return 'transport-failure'
	}
}

export interface VerificationInput {
	source: string
	verifiedBy: VerifiedBy
	crawl: string
	trust?: Extract<Trust, 'verified' | 'authoritative'>
	feedHost?: string | null
	verifiedAt: Date
}

/** Writes the proof triple. The database refuses it unless `crawl` is a finished, successful crawl of this source. */
export async function recordVerification(sql: Sql, input: VerificationInput): Promise<void> {
	await sql`
		update source set
			trust = ${input.trust ?? 'verified'},
			verified_by = ${input.verifiedBy},
			verified_at = ${input.verifiedAt},
			verified_crawl = ${input.crawl},
			feed_host = ${input.feedHost ?? null}
		where id = ${input.source}
	`
}

export interface IdentityUpgradeInput {
	source: string
	name: string
	kind: SourceKind
	verifiedBy: VerifiedBy
	crawl: string
	feedHost: string | null
	verifiedAt: Date
}

/**
 * A hosted slug becoming the domain that delegates to it. The row keeps its `id`, so every `sku`
 * scope and every `opid` it minted survives; only the identity moves.
 */
export async function upgradeSourceIdentity(sql: Sql, input: IdentityUpgradeInput): Promise<void> {
	await sql`
		update source set
			name = ${input.name},
			kind = ${input.kind},
			trust = 'verified',
			verified_by = ${input.verifiedBy},
			verified_at = ${input.verifiedAt},
			verified_crawl = ${input.crawl},
			feed_host = ${input.feedHost},
			lapsed_at = null,
			failing_since = null
		where id = ${input.source}
	`
}

export async function setSourceLicense(sql: Sql, source: string, license: string | null): Promise<void> {
	await sql`update source set license = ${license} where id = ${source}`
}

export async function readFeedStates(sql: Sql, source: string): Promise<Map<string, FeedRow>> {
	const rows = await sql<FeedRow[]>`
		select source::text, url, etag, last_modified, last_fetched_at, last_status, skipping_since
		from feed where source = ${source}
	`
	return new Map(rows.map((row) => [row.url, row]))
}

export interface FeedStateInput {
	source: string
	url: string
	etag?: string | null
	lastModified?: string | null
	status: number | null
	skippedLines: number
	at: Date
}

/**
 * The conditional-request state for one URL. `skipping_since` marks the start of the current
 * unbroken run of fetches with skipped lines; a clean fetch clears it.
 */
export async function saveFeedState(sql: Sql, input: FeedStateInput): Promise<void> {
	const skipping = input.skippedLines > 0
	await sql`
		insert into feed (source, url, etag, last_modified, last_fetched_at, last_status, skipping_since)
		values (
			${input.source}, ${input.url}, ${input.etag ?? null}, ${input.lastModified ?? null},
			${input.at}, ${input.status}, ${skipping ? input.at : null}
		)
		on conflict (source, url) do update set
			etag = coalesce(${input.etag ?? null}, feed.etag),
			last_modified = coalesce(${input.lastModified ?? null}, feed.last_modified),
			last_fetched_at = ${input.at},
			last_status = ${input.status},
			skipping_since = case when ${skipping} then coalesce(feed.skipping_since, ${input.at}) else null end
	`
}

/** True while a feed is inside the seven days a run of skipped lines buys it, during which it withdraws nothing. */
export function withinSkipGrace(feed: FeedRow | undefined, now: Date, grace = SKIPPING_GRACE_MS): boolean {
	if (feed?.skipping_since == null) return false
	return feed.skipping_since.getTime() > now.getTime() - grace
}

export async function sourcesDueForCrawl(sql: Sql, input: { now: Date; intervalMs: number; limit: number }): Promise<SourceRow[]> {
	const cutoff = new Date(input.now.getTime() - input.intervalMs)
	return await sql<SourceRow[]>`
		select ${sql.unsafe(SOURCE_COLUMNS)} from source
		where last_crawled_at is null or last_crawled_at <= ${cutoff}
		order by last_crawled_at nulls first, id
		limit ${input.limit}
	`
}

/**
 * How many sources are verified at a host. Both per-host lanes scale with it, so a host that serves
 * documents for thousands of domains is crawled faster — and a stranger's domain pointed at someone
 * else's host never verifies, so it cannot inflate the number.
 */
export async function countVerifiedSourcesAtHost(sql: Sql, host: string): Promise<number> {
	const rows = await sql<{ verified: number }[]>`
		select count(*)::int as verified from source
		where trust <> 'unverified' and ((feed_host is null and name = ${host}) or feed_host = ${host})
	`
	return rows[0]?.verified ?? 0
}

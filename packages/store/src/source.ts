import type { CrawlVia, SourceKind, Trust, VerifiedBy } from '@prodid/core'

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
	queued_at: Date | null
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
	retired_at: Date | null
}

const SOURCE_COLUMNS = `id::text, kind, name, trust, verified_by, verified_at, verified_crawl::text,
	lapsed_at, failing_since, feed_host, license, last_crawled_at, queued_at, created_at`

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
	input: { source: string; via?: CrawlVia | null; documentUrl?: string | null; startedAt: Date },
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
	error?: string | null
	/** The accepted document's `publisher.contact`, kept only when the crawl succeeds; absent when the document answered 304. */
	contact?: string | null | undefined
	finishedAt: Date
}

export interface CrawlProgress {
	crawl: string
	recordsSeen?: number
	recordsChanged?: number
	linesSkipped?: number
	feedsFailed?: number
	/** Identifier disagreements, appended as they are found. */
	conflicts?: readonly unknown[]
}

/**
 * A crawl is one row from discovery to finalize, and its counters are written by each feed as it is
 * read. Adding to them rather than setting them is what lets a crawl span several queue messages.
 */
export async function accumulateCrawl(sql: Sql, input: CrawlProgress): Promise<void> {
	const conflicts = input.conflicts ?? []
	await sql`
		update crawl set
			records_seen = coalesce(records_seen, 0) + ${input.recordsSeen ?? 0},
			records_changed = coalesce(records_changed, 0) + ${input.recordsChanged ?? 0},
			lines_skipped = coalesce(lines_skipped, 0) + ${input.linesSkipped ?? 0},
			feeds_failed = coalesce(feeds_failed, 0) + ${input.feedsFailed ?? 0},
			conflicts = case
				when ${conflicts.length} = 0 then conflicts
				else coalesce(conflicts, '[]'::jsonb) || ${JSON.stringify(conflicts)}::text::jsonb
			end
		where id = ${input.crawl}
	`
}

/**
 * One media entry that produced no claim. Media runs after its crawl has finished, so this is
 * accumulated onto a closed row: a per-crawl count, never a per-entry report.
 */
export async function countMediaFailure(sql: Sql, crawl: string): Promise<void> {
	await sql`update crawl set media_failed = media_failed + 1 where id = ${crawl}`
}

/**
 * The feed rows a document's URLs need before any record can name one. A URL the document lists
 * again is un-retired here: listing it is the publisher taking it back.
 */
export async function ensureFeeds(sql: Sql, source: string, urls: readonly string[]): Promise<void> {
	if (urls.length === 0) return
	await sql`
		insert into feed (source, url)
		select ${source}, u.url from unnest(${urls as string[]}::text[]) as u(url)
		on conflict (source, url) do update set retired_at = null
	`
}

/**
 * A URL a successfully read document no longer lists. The feed is retired and everything still live
 * in it is withdrawn, in one transaction with one timestamp: one publisher action, one outcome.
 *
 * Only a document that was actually read may retire anything. A `304` says the list did not change,
 * so there is nothing to retire, and a retired feed is never fetched and so never a failed feed.
 */
export async function retireAbsentFeeds(
	sql: Sql,
	input: { source: string; keep: readonly string[]; now: Date },
): Promise<{ feeds: number; records: number }> {
	const rows = await sql<{ feeds: string; records: string }[]>`
		with retired as (
			update feed set retired_at = ${input.now}
			where source = ${input.source} and retired_at is null and not (url = any(${input.keep as string[]}::text[]))
			returning url
		), gone as (
			update record set withdrawn_at = ${input.now}
			where source = ${input.source} and withdrawn_at is null and feed in (select url from retired)
			returning key
		), dropped as (
			update claim set withdrawn_at = ${input.now}
			where source = ${input.source} and withdrawn_at is null and record_key in (select key from gone)
			returning id
		)
		select (select count(*) from retired)::text as feeds, (select count(*) from gone)::text as records
	`
	const counted = rows[0]
	return { feeds: Number(counted?.feeds ?? 0), records: Number(counted?.records ?? 0) }
}

/**
 * Whether the source still asserts anything. A source with nothing live has to be read
 * unconditionally: its validators survive an outage, so a publisher serving unchanged bytes would
 * answer `304` forever and never re-assert the catalogue the thirty-day sweep withdrew.
 */
export async function hasLiveRecords(sql: Sql, source: string): Promise<boolean> {
	const rows = await sql<{ live: boolean }[]>`
		select exists (select 1 from record where source = ${source} and withdrawn_at is null) as live
	`
	return rows[0]?.live ?? false
}

/** Whether this crawl is still the open one. A message that outlived its crawl must write nothing. */
export async function isCrawlOpen(sql: Sql, crawl: string): Promise<boolean> {
	const rows = await sql<{ open: boolean }[]>`select finished_at is null as open from crawl where id = ${crawl}`
	return rows[0]?.open ?? false
}

/** A lapse that has just started on a source with a contact to tell. */
export interface LapseNotice {
	source: string
	lapsedAt: Date
}

/**
 * Closes the crawl row and moves the source's lapse state with it, in one transaction: the outcome
 * and what it means for the source are the same fact and must not be observable apart. Returns the
 * lapse this crawl started, when the source has a contact to tell.
 */
export function finishCrawl(sql: Sql, input: FinishCrawlInput): Promise<LapseNotice | null> {
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
				error = ${input.error ?? null}
			where id = ${input.crawl}
		`
		const before = await tx<{ lapsed_at: Date | null }[]>`select lapsed_at from source where id = ${input.source} for update`
		switch (classifyOutcome(input.outcome)) {
			case 'success':
				await tx`
					update source set
						last_crawled_at = ${at}, queued_at = null, failing_since = null, lapsed_at = null,
						contact = case when ${input.contact !== undefined} then ${input.contact ?? null} else contact end
					where id = ${input.source}
				`
				return null
			case 'definite-negative':
				return startedLapse(
					before[0]?.lapsed_at ?? null,
					await tx<LapseRow[]>`
						update source set
							last_crawled_at = ${at}, queued_at = null, failing_since = null, lapsed_at = coalesce(lapsed_at, ${at})
						where id = ${input.source}
						returning id::text, lapsed_at, contact is not null as has_contact
					`,
				)
			case 'transport-failure':
				return startedLapse(
					before[0]?.lapsed_at ?? null,
					await tx<LapseRow[]>`
						update source set
							last_crawled_at = ${at},
							queued_at = null,
							failing_since = coalesce(failing_since, ${at}),
							lapsed_at = case
								when coalesce(failing_since, ${at}) <= ${lapseCutoff} then coalesce(lapsed_at, ${at})
								else lapsed_at
							end
						where id = ${input.source}
						returning id::text, lapsed_at, contact is not null as has_contact
					`,
				)
		}
	})
}

interface LapseRow {
	id: string
	lapsed_at: Date | null
	has_contact: boolean
}

function startedLapse(before: Date | null, rows: readonly LapseRow[]): LapseNotice | null {
	const row = rows[0]
	if (before !== null || row === undefined || row.lapsed_at === null || !row.has_contact) return null
	return { source: row.id, lapsedAt: row.lapsed_at }
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
		select source::text, url, etag, last_modified, last_fetched_at, last_status, skipping_since, retired_at
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

/**
 * How long a source stays claimed before it is due again, and how old an unfinished crawl has to be
 * before the sweep calls it abandoned. It has to be comfortably longer than the longest deferral a
 * crawl can take (`POLICY.maxDeferralSeconds`, one hour): if they were equal, a crawl deferred for
 * the maximum would come back exactly as the sweep decided it was gone, and a deferral would be
 * written as `fetch-failed` — an outcome, which a deferral must never be.
 */
export const QUEUE_LEASE_MS = 6 * 3_600_000

/**
 * Claims the sources that are due and marks them handed to the queue in the same statement, so two
 * overlapping cron runs cannot enqueue one source twice. `skip locked` lets the second run take the
 * next page instead of waiting for the first. The lease expires, so a source whose crawl never came
 * back becomes due again.
 */
export async function claimDueSources(
	sql: Sql,
	input: { now: Date; intervalMs: number; limit: number; leaseMs?: number },
): Promise<SourceRow[]> {
	const cutoff = new Date(input.now.getTime() - input.intervalMs)
	const lease = new Date(input.now.getTime() - (input.leaseMs ?? QUEUE_LEASE_MS))
	return await sql<SourceRow[]>`
		with due as (
			select id from source
			where (last_crawled_at is null or last_crawled_at <= ${cutoff})
				and (queued_at is null or queued_at <= ${lease})
				and kind <> 'dataset'
			order by last_crawled_at nulls first, id
			limit ${input.limit}
			for update skip locked
		)
		update source set queued_at = ${input.now}
		where id in (select id from due)
		returning ${sql.unsafe(SOURCE_COLUMNS)}
	`
}

/**
 * A crawl whose feed message never came back. Nothing else closes it, and the contract calls `crawl`
 * a log of discovery runs, so it is finished as what it was: something that could not be read.
 */
export async function finalizeStaleCrawls(
	sql: Sql,
	input: { now: Date; olderThanMs: number },
): Promise<{ finished: number; notices: LapseNotice[] }> {
	const cutoff = new Date(input.now.getTime() - input.olderThanMs)
	const stale = await sql<{ id: string; source: string }[]>`
		select id::text, source::text from crawl
		where finished_at is null and started_at <= ${cutoff} and via is distinct from 'import'
	`
	const notices: LapseNotice[] = []
	for (const row of stale) {
		const notice = await finishCrawl(sql, {
			crawl: row.id,
			source: row.source,
			outcome: 'fetch-failed',
			error: 'abandoned: no message came back for this crawl',
			finishedAt: input.now,
		})
		if (notice !== null) notices.push(notice)
	}
	return { finished: stale.length, notices }
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

export interface ClaimedNotice {
	name: string
	contact: string
	/** The outcome of the crawl that started the lapse. */
	outcome: 'definite-negative' | 'transport-failure'
	/** What `notified_lapse_at` was before this claim, put back if the mail cannot be sent. */
	previous: Date | null
}

/**
 * Takes the right to send the notice of one lapse. It is taken once: a second delivery of the same
 * message, a lapse that has been cleared, and a source with no contact all get nothing.
 */
export async function claimLapseNotice(sql: Sql, notice: LapseNotice): Promise<ClaimedNotice | null> {
	const rows = await sql<{ name: string; contact: string; outcome: CrawlOutcome | null; previous: Date | null }[]>`
		with prior as (
			select id, notified_lapse_at from source where id = ${notice.source} for update
		)
		update source s set notified_lapse_at = s.lapsed_at
		from prior
		where s.id = prior.id and s.lapsed_at = ${notice.lapsedAt} and s.contact is not null
			and s.notified_lapse_at is distinct from s.lapsed_at
		returning s.name, s.contact, prior.notified_lapse_at as previous, (
			select c.outcome from crawl c
			where c.source = s.id and c.finished_at is not null and c.finished_at <= s.lapsed_at
			order by c.finished_at desc, c.id desc limit 1
		) as outcome
	`
	const row = rows[0]
	if (row === undefined) return null
	return {
		name: row.name,
		contact: row.contact,
		outcome: row.outcome !== null && classifyOutcome(row.outcome) === 'definite-negative' ? 'definite-negative' : 'transport-failure',
		previous: row.previous,
	}
}

/** Gives the claim back after a send that failed, so the retry can take it again. */
export async function releaseLapseNotice(sql: Sql, notice: LapseNotice, previous: Date | null): Promise<void> {
	await sql`
		update source set notified_lapse_at = ${previous}
		where id = ${notice.source} and notified_lapse_at = ${notice.lapsedAt}
	`
}

import type { Sql } from './client'
import { withRetry } from './client'
import { ingestRecords, type IngestResult } from './ingest'
import type { PreparedRecord } from './prepare'
import { accumulateCrawl, findSourceByName, type SourceRow, startCrawl } from './source'
import type { WithdrawalResult } from './withdraw'

const DATASET_SLUG = /^(?!..--)[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

/** `dataset:<slug>`, or null when the slug is not one: the grammar of a hosted slug. */
export function datasetSourceName(slug: string): string | null {
	return DATASET_SLUG.test(slug) ? `dataset:${slug}` : null
}

/** The source of a dataset, created on first import; its licence is the dataset's own and follows every import. */
export function ensureDatasetSource(sql: Sql, input: { slug: string; license: string | null; now: Date }): Promise<SourceRow> {
	const name = datasetSourceName(input.slug)
	if (name === null) throw new RangeError(`not a dataset slug: ${JSON.stringify(input.slug)}`)
	return withRetry(async () => {
		const existing = await findSourceByName(sql, name)
		if (existing !== null) {
			if (existing.license === input.license) return existing
			await sql`update source set license = ${input.license} where id = ${existing.id}`
			return { ...existing, license: input.license }
		}
		await sql`insert into source (kind, name, license, created_at) values ('dataset', ${name}, ${input.license}, ${input.now})`
		const created = await findSourceByName(sql, name)
		if (created === null) throw new Error(`source ${name} was not created`)
		return created
	})
}

/** One import of a dataset's export: its `crawl` row, open until `finishImport`. */
export interface ImportRun {
	source: string
	crawl: string
	startedAt: Date
}

export async function startImport(sql: Sql, input: { source: string; documentUrl: string; startedAt: Date }): Promise<ImportRun> {
	if (!input.documentUrl.startsWith('https://') || !URL.canParse(input.documentUrl)) {
		throw new RangeError(`an export is read from a public https URL: ${JSON.stringify(input.documentUrl)}`)
	}
	const crawl = await startCrawl(sql, { source: input.source, via: 'import', documentUrl: input.documentUrl, startedAt: input.startedAt })
	return { source: input.source, crawl, startedAt: input.startedAt }
}

/**
 * Writes one batch of an import through the crawl's own ingest, with no feed, and adds it to the
 * import's counters. An import is as many batches as its export needs.
 */
export async function importRecords(
	sql: Sql,
	run: ImportRun,
	input: { records: readonly PreparedRecord[]; linesSkipped?: number; now: Date },
): Promise<IngestResult> {
	// A full import withdraws what it did not see by `last_seen`, so nothing it writes may be older than its start.
	if (input.now.getTime() < run.startedAt.getTime()) throw new RangeError('an import cannot write before it started')
	const [open] = await sql<{ open: boolean }[]>`select finished_at is null as open from crawl where id = ${run.crawl}`
	if (open?.open !== true) throw new Error(`import ${run.crawl} is not open`)
	const result = await ingestRecords(sql, { source: run.source, feed: null, records: input.records, now: input.now })
	await accumulateCrawl(sql, {
		crawl: run.crawl,
		recordsSeen: result.seen,
		recordsChanged: result.changed,
		linesSkipped: input.linesSkipped ?? 0,
		conflicts: result.disagreements,
	})
	return result
}

export interface ImportOutcome {
	outcome: 'changed' | 'unchanged'
	withdrawn: WithdrawalResult
}

/**
 * Closes the import. A full one first withdraws every live record of the source it did not write,
 * with its claims, at the finishing time; the withdrawal and the crawl's outcome commit together.
 */
export function finishImport(sql: Sql, run: ImportRun, input: { full: boolean; finishedAt: Date }): Promise<ImportOutcome> {
	return sql.begin(async (tx) => {
		const [crawl] = await tx<{ changed: number | null; open: boolean }[]>`
			select records_changed as changed, finished_at is null as open from crawl where id = ${run.crawl} for update
		`
		if (crawl?.open !== true) throw new Error(`import ${run.crawl} is not open`)
		let withdrawn: WithdrawalResult = { records: 0, claims: 0 }
		if (input.full) {
			const [counted] = await tx<{ records: string; claims: string }[]>`
				with gone as (
					update record set withdrawn_at = ${input.finishedAt}
					where source = ${run.source} and withdrawn_at is null and last_seen < ${run.startedAt}
					returning key
				), dropped as (
					update claim set withdrawn_at = ${input.finishedAt}
					where source = ${run.source} and withdrawn_at is null and record_key in (select key from gone)
					returning id
				)
				select (select count(*) from gone)::text as records, (select count(*) from dropped)::text as claims
			`
			withdrawn = { records: Number(counted?.records ?? 0), claims: Number(counted?.claims ?? 0) }
		}
		const outcome = (crawl.changed ?? 0) > 0 || withdrawn.records > 0 ? 'changed' : 'unchanged'
		await tx`update crawl set finished_at = ${input.finishedAt}, outcome = ${outcome} where id = ${run.crawl}`
		await tx`
			update source set last_crawled_at = ${input.finishedAt}, queued_at = null
			where id = ${run.source}
		`
		return { outcome, withdrawn }
	}) as Promise<ImportOutcome>
}

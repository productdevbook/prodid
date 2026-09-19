import type { Sql } from './client'

export interface WithdrawalResult {
	records: number
	claims: number
}

/**
 * Withdraws the keys one fully read feed no longer carries. Withdrawal is scoped to that feed, so a
 * sibling that answered 304 is left exactly as it was and a key that moved between two feeds is not
 * withdrawn by the one it left. `feed` is null for records that never came from a fetched URL —
 * dataset imports and contributions — and those are swept source-wide.
 *
 * The record and every active claim of it move in one statement with one timestamp, so a reader
 * never sees one without the other. An empty `seenKeys` means the feed published nothing.
 */
export async function withdrawAbsentRecords(
	sql: Sql,
	input: { source: string; feed: string | null; seenKeys: readonly string[]; now: Date },
): Promise<WithdrawalResult> {
	const rows = await sql<{ records: string; claims: string }[]>`
		with gone as (
			update record set withdrawn_at = ${input.now}
			where source = ${input.source}
				and feed is not distinct from ${input.feed}
				and withdrawn_at is null
				and not (key = any(${input.seenKeys as string[]}::text[]))
			returning key
		), dropped as (
			update claim set withdrawn_at = ${input.now}
			where source = ${input.source} and withdrawn_at is null and record_key in (select key from gone)
			returning id
		)
		select (select count(*) from gone)::text as records, (select count(*) from dropped)::text as claims
	`
	const counted = rows[0]
	return { records: Number(counted?.records ?? 0), claims: Number(counted?.claims ?? 0) }
}

/**
 * Everything a source still asserts, withdrawn at one timestamp: the records and their claims
 * together. Leaving the records live would let the next crawl find them unchanged and assert
 * nothing, so the source would read as silent while its claims were gone.
 */
export async function withdrawSource(sql: Sql, input: { source: string; now: Date }): Promise<WithdrawalResult> {
	const rows = await sql<{ records: string; claims: string }[]>`
		with gone as (
			update record set withdrawn_at = ${input.now}
			where source = ${input.source} and withdrawn_at is null
			returning key
		), dropped as (
			update claim set withdrawn_at = ${input.now}
			where source = ${input.source} and withdrawn_at is null
			returning id
		)
		select (select count(*) from gone)::text as records, (select count(*) from dropped)::text as claims
	`
	const counted = rows[0]
	return { records: Number(counted?.records ?? 0), claims: Number(counted?.claims ?? 0) }
}

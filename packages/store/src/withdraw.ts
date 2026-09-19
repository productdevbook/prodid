import type { Sql } from './client'

export interface WithdrawalResult {
	records: number
	claims: number
}

/**
 * Withdraws the keys a fully fetched feed no longer carries. The record and every active claim of it
 * move in one statement and carry the same timestamp, so a reader never sees one without the other.
 * An empty `seenKeys` means the source published nothing this crawl, and all of it is withdrawn.
 */
export async function withdrawAbsentRecords(
	sql: Sql,
	input: { source: string; seenKeys: readonly string[]; now: Date },
): Promise<WithdrawalResult> {
	const rows = await sql<{ records: string; claims: string }[]>`
		with gone as (
			update record set withdrawn_at = ${input.now}
			where source = ${input.source} and withdrawn_at is null and not (key = any(${input.seenKeys as string[]}::text[]))
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

/** Every active claim of a source, withdrawn at one timestamp. The records stay live; only the assertions stop. */
export async function withdrawSourceClaims(sql: Sql, input: { source: string; now: Date }): Promise<number> {
	const rows = await sql<{ id: string }[]>`
		update claim set withdrawn_at = ${input.now}
		where source = ${input.source} and withdrawn_at is null
		returning id::text
	`
	return rows.length
}

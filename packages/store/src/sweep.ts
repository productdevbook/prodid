import type { Sql } from './client'
import { LAPSE_AFTER_FAILING_MS, WITHDRAW_AFTER_LAPSE_MS } from './source'
import { withdrawSource } from './withdraw'

export interface SweepResult {
	/** Sources whose unbroken run of transport failures reached seven days. */
	lapsed: string[]
	/** Sources lapsed for thirty days whose records and active claims were withdrawn. */
	withdrawn: { source: string; records: number; claims: number }[]
}

/**
 * Seven days of pure transport failure lapse a source; thirty days lapsed withdraw its claims. Both
 * are also applied as each crawl finishes; this is what reaches a source nobody is crawling.
 */
export async function lapseSweep(
	sql: Sql,
	input: { now: Date; failingMs?: number; withdrawMs?: number; limit?: number },
): Promise<SweepResult> {
	const failingCutoff = new Date(input.now.getTime() - (input.failingMs ?? LAPSE_AFTER_FAILING_MS))
	const lapsedCutoff = new Date(input.now.getTime() - (input.withdrawMs ?? WITHDRAW_AFTER_LAPSE_MS))
	const limit = input.limit ?? 1000

	const lapsed = await sql<{ id: string }[]>`
		update source set lapsed_at = ${input.now}
		where lapsed_at is null and failing_since is not null and failing_since <= ${failingCutoff}
		returning id::text
	`

	const due = await sql<{ id: string }[]>`
		select s.id::text from source s
		where s.lapsed_at is not null and s.lapsed_at <= ${lapsedCutoff}
			and exists (select 1 from claim c where c.source = s.id and c.withdrawn_at is null)
		order by s.lapsed_at
		limit ${limit}
	`

	const withdrawn: { source: string; records: number; claims: number }[] = []
	for (const row of due) {
		const result = await withdrawSource(sql, { source: row.id, now: input.now })
		withdrawn.push({ source: row.id, ...result })
	}

	return { lapsed: lapsed.map((row) => row.id), withdrawn }
}

import type { Sql, TransactionSql } from './client'
import { withRetry } from './client'

const MAX_CHAIN = 16

export interface MergeInput {
	from: string
	into: string
	reason: string
	decidedBy: string
	now: Date
}

export interface MergeResult {
	survivor: string
	/** Opids that pointed at `from` and were moved to the survivor in the same transaction. */
	repointed: string[]
}

/**
 * Merges `from` into the final survivor of `into`. There are no chains, so merging a survivor
 * repoints everything that pointed at it, in this same transaction. Nothing is repointed at the row
 * level: identifiers and claims stay on the opid they were written to, which is what makes the
 * revert lossless. The deferred triggers mean a violation surfaces at COMMIT, not at the statement.
 */
export function mergeEntities(sql: Sql, input: MergeInput): Promise<MergeResult> {
	return withRetry(() =>
		sql.begin(async (tx) => {
			const survivor = await finalSurvivor(tx, input.into)
			if (survivor === input.from) throw new Error(`merging ${input.from} into ${input.into} would merge it into itself`)

			// The survivor is locked first and by every writer of either side, so two merges aiming at
			// one survivor queue rather than interleave.
			await tx`select opid from entity where opid = ${survivor} for update`

			const current = await tx<{ merged_into: string | null }[]>`
				select merged_into from entity where opid = ${input.from} for update
			`
			const state = current[0]
			if (state === undefined) throw new Error(`entity ${input.from} does not exist`)
			if (state.merged_into !== null) {
				throw new Error(`entity ${input.from} is already merged into ${state.merged_into}; revert it first`)
			}

			const pointing = await tx<{ opid: string }[]>`select opid from entity where merged_into = ${input.from} order by opid`
			const repointed = pointing.map((row) => row.opid)
			for (const opid of repointed) {
				await tx`update merge set reverted_at = ${input.now} where from_opid = ${opid} and reverted_at is null`
				await tx`
					insert into merge (from_opid, into_opid, reason, decided_by, decided_at)
					values (${opid}, ${survivor}, ${`repointed: ${input.reason}`}, ${input.decidedBy}, ${input.now})
				`
				await tx`update entity set merged_into = ${survivor} where opid = ${opid}`
			}

			await tx`
				insert into merge (from_opid, into_opid, reason, decided_by, decided_at)
				values (${input.from}, ${survivor}, ${input.reason}, ${input.decidedBy}, ${input.now})
			`
			await tx`update entity set merged_into = ${survivor} where opid = ${input.from}`
			return { survivor, repointed }
		}),
	)
}

/** Clears `merged_into` and stamps the log row. The losing opid resolves on its own again, with everything it ever held. */
export function revertMerge(sql: Sql, input: { from: string; now: Date }): Promise<boolean> {
	return withRetry(() =>
		sql.begin(async (tx) => {
			const rows = await tx<{ id: string }[]>`
				select id::text from merge where from_opid = ${input.from} and reverted_at is null for update
			`
			const active = rows[0]
			if (active === undefined) return false
			await tx`update merge set reverted_at = ${input.now} where id = ${active.id}`
			await tx`update entity set merged_into = null where opid = ${input.from}`
			return true
		}),
	)
}

async function finalSurvivor(tx: TransactionSql, opid: string): Promise<string> {
	let at = opid
	for (let step = 0; step < MAX_CHAIN; step += 1) {
		const rows = await tx<{ merged_into: string | null }[]>`select merged_into from entity where opid = ${at}`
		const row = rows[0]
		if (row === undefined) throw new Error(`entity ${at} does not exist`)
		if (row.merged_into === null) return at
		at = row.merged_into
	}
	throw new Error(`merge chain from ${opid} is longer than ${MAX_CHAIN}`)
}

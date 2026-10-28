import { isOpid } from '@prodid/core'
import { createClient, mergeEntities, revertMerge, type Sql } from '@prodid/store'

export const MAX_REASON = 500

export class MergeError extends Error {}

export interface MergeEnv {
	DATABASE_URL: string
	PRODID_OPERATOR: string
}

export function databaseEnv(env: Record<string, string | undefined>): string {
	if (env.DATABASE_URL === undefined || env.DATABASE_URL === '') throw new MergeError('DATABASE_URL is not set')
	return env.DATABASE_URL
}

export function mergeEnv(env: Record<string, string | undefined>): MergeEnv {
	const url = databaseEnv(env)
	const operator = env.PRODID_OPERATOR?.trim() ?? ''
	if (operator === '') throw new MergeError('PRODID_OPERATOR is not set')
	return { DATABASE_URL: url, PRODID_OPERATOR: operator }
}

export function parseOpid(value: string): string {
	if (!isOpid(value)) throw new MergeError(`${value} is not an opid`)
	return value
}

export function parseReason(value: string): string {
	const reason = value.trim()
	if (reason === '') throw new MergeError('--reason is empty')
	const length = [...reason].length
	if (length > MAX_REASON) throw new MergeError(`--reason is ${length} characters, at most ${MAX_REASON}`)
	return reason
}

export interface MergeCommand {
	from: string
	into: string
	reason: string
	now: Date
}

export interface RunOptions {
	log?: (line: string) => void
}

export async function runMerge(env: MergeEnv, input: MergeCommand, options: RunOptions = {}): Promise<void> {
	const log = options.log ?? console.log
	if (input.from === input.into) throw new MergeError(`cannot merge ${input.from} into itself`)
	log(`database: ${new URL(env.DATABASE_URL).host}`)

	await withDatabase(env.DATABASE_URL, async (sql) => {
		const rows = await sql<{ opid: string; kind: string; merged_into: string | null }[]>`
			select opid, kind, merged_into from entity where opid in (${input.from}, ${input.into})
		`
		const from = rows.find((row) => row.opid === input.from)
		const into = rows.find((row) => row.opid === input.into)
		if (from === undefined) throw new MergeError(`entity ${input.from} does not exist`)
		if (into === undefined) throw new MergeError(`entity ${input.into} does not exist`)
		if (from.kind !== into.kind) {
			throw new MergeError(`cannot merge ${from.kind} ${input.from} into ${into.kind} ${input.into}; the kinds differ`)
		}
		if (from.merged_into !== null) {
			throw new MergeError(`${input.from} is already merged into ${from.merged_into}; unmerge it first`)
		}

		const result = await mergeEntities(sql, {
			from: input.from,
			into: input.into,
			reason: input.reason,
			decidedBy: env.PRODID_OPERATOR,
			now: input.now,
		}).catch((error: unknown) => {
			throw new MergeError(`merge failed: ${error instanceof Error ? error.message : String(error)}`)
		})
		const [logged] = await sql<{ id: string }[]>`
			select id::text from merge where from_opid = ${input.from} and reverted_at is null
		`
		log(`merge: ${logged?.id ?? '?'}`)
		log(`survivor: ${result.survivor}`)
		for (const opid of result.repointed) log(`repointed: ${opid} -> ${result.survivor}`)
	})
}

export async function runUnmerge(databaseUrl: string, input: { from: string; now: Date }, options: RunOptions = {}): Promise<void> {
	const log = options.log ?? console.log
	log(`database: ${new URL(databaseUrl).host}`)

	await withDatabase(databaseUrl, async (sql) => {
		const [entity] = await sql<{ merged_into: string | null }[]>`select merged_into from entity where opid = ${input.from}`
		if (entity === undefined) throw new MergeError(`entity ${input.from} does not exist`)
		const survivor = entity.merged_into
		if (survivor === null || !(await revertMerge(sql, input))) throw new MergeError(`${input.from} is not merged`)
		log(`unmerged: ${input.from} from ${survivor}`)
		log(`${input.from} resolves to ${input.from}`)
		log(`${survivor} resolves to ${survivor}`)
	})
}

async function withDatabase(url: string, work: (sql: Sql) => Promise<void>): Promise<void> {
	const sql = createClient(url, { max: 1, onnotice: () => {} })
	try {
		await work(sql)
	} finally {
		await sql.end({ timeout: 5 })
	}
}

import postgres, { type Options, type PostgresType, type Sql } from 'postgres'

export type { Sql, TransactionSql } from 'postgres'

/** SQLSTATEs a writer may hit through no fault of its own, and should simply try again. */
const RETRYABLE = new Set([
	'40001', // serialization_failure
	'40P01', // deadlock_detected
	'23505', // unique_violation — another session claimed the identifier or grouping first
	'55P03', // lock_not_available
])

export const DEFAULT_ATTEMPTS = 6

/**
 * A pool for a Hyperdrive connection string inside a Worker, or a direct one under bun.
 *
 * `fetch_types` stays on although Hyperdrive's guidance suggests turning it off: without the type
 * map postgres.js cannot serialize an array parameter and sends `{'a','b'}` as the text `a,b`, which
 * every `unnest(...)` and `= any(...)` in this package would fail on. It costs one query per
 * connection, and Hyperdrive pools connections.
 */
export function createClient(connectionString: string, options: Options<Record<string, PostgresType>> = {}): Sql {
	return postgres(connectionString, { max: 5, prepare: false, ...options })
}

export function isRetryable(error: unknown): boolean {
	return error !== null && typeof error === 'object' && 'code' in error && RETRYABLE.has(String((error as { code: unknown }).code))
}

/**
 * Runs a transaction body until it commits or stops being retryable. Two crawls writing the same
 * new GTIN or the same new grouping key race on a primary key by design: the loser's whole
 * transaction rolls back, taking the entity it minted with it, and the retry finds the winner's row.
 */
export async function withRetry<T>(run: () => Promise<T>, attempts = DEFAULT_ATTEMPTS): Promise<T> {
	let last: unknown
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			return await run()
		} catch (error) {
			if (!isRetryable(error)) throw error
			last = error
			await backoff(attempt)
		}
	}
	throw last
}

function backoff(attempt: number): Promise<void> {
	const ceiling = Math.min(2 ** attempt, 32)
	return new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * ceiling)))
}

import { readNdjson, validateItem } from '@prodid/core'
import { type Disagreement, ingestRecords, type PreparedRecord, prepareRecord, type Sql } from '@prodid/store'

import type { Caps, GuardedFetcher } from '../net/guard'

const INGEST_BATCH = 200

export type FeedRead =
	| { kind: 'deferred'; retryAfterMs: number }
	| { kind: 'failed'; status: number | null; reason: string }
	| { kind: 'not-modified'; status: 304; etag: string | null; lastModified: string | null }
	| {
			kind: 'read'
			status: number
			etag: string | null
			lastModified: string | null
			keys: string[]
			seen: number
			changed: number
			skipped: number
			claimsInserted: number
			claimsWithdrawn: number
			disagreements: Disagreement[]
	  }

export interface FeedInput {
	sql: Sql
	fetcher: GuardedFetcher
	caps: Caps
	source: string
	url: string
	headers: Record<string, string>
	now: Date
}

/**
 * One feed, streamed. The body is never buffered: lines come off the byte stream through core's
 * reader with the line cap applied, and records reach the database in bounded batches, so a 256 MiB
 * feed costs a batch of memory rather than a feed of it.
 */
export async function readFeed(input: FeedInput): Promise<FeedRead> {
	const response = await input.fetcher.fetch(input.url, { headers: input.headers, timeoutMs: input.caps.feedMs })
	if (!response.ok) return { kind: 'failed', status: response.status ?? null, reason: response.reason }

	const etag = response.headers.get('etag')
	const lastModified = response.headers.get('last-modified')
	if (response.status === 304) {
		await response.body?.cancel().catch(() => {})
		return { kind: 'not-modified', status: 304, etag, lastModified }
	}
	if (response.status !== 200) {
		await response.body?.cancel().catch(() => {})
		return { kind: 'failed', status: response.status, reason: `status-${response.status}` }
	}
	if (response.body === null) return { kind: 'failed', status: response.status, reason: 'empty-body' }

	const keys = new Set<string>()
	let seen = 0
	let changed = 0
	let skipped = 0
	let claimsInserted = 0
	let claimsWithdrawn = 0
	const disagreements: Disagreement[] = []
	let batch: PreparedRecord[] = []

	const flush = async (): Promise<void> => {
		if (batch.length === 0) return
		const result = await ingestRecords(input.sql, { source: input.source, records: batch, now: input.now })
		seen += result.seen
		changed += result.changed
		claimsInserted += result.claimsInserted
		claimsWithdrawn += result.claimsWithdrawn
		disagreements.push(...result.disagreements)
		for (const key of result.keys) keys.add(key)
		batch = []
	}

	const deadline = AbortSignal.timeout(input.caps.feedMs)
	const stream = input.fetcher.limit(response.body, input.caps.feedBytes, deadline)
	try {
		for await (const entry of readNdjson(stream, { maxLineBytes: input.caps.lineBytes })) {
			if (!entry.ok) {
				skipped += 1
				continue
			}
			const record = validateItem(entry.value)
			if (!record.ok) {
				skipped += 1
				continue
			}
			const prepared = await prepareRecord(record.value, input.source)
			if (!prepared.ok) {
				skipped += 1
				continue
			}
			batch.push(prepared.prepared)
			if (batch.length >= INGEST_BATCH) await flush()
		}
		await flush()
	} catch (error) {
		// A cap or a deadline reached mid-stream: whatever committed stays, the feed did not answer.
		await flush().catch(() => {})
		return { kind: 'failed', status: response.status, reason: error instanceof Error ? error.message : String(error) }
	}

	return {
		kind: 'read',
		status: 200,
		etag,
		lastModified,
		keys: [...keys],
		seen,
		changed,
		skipped,
		claimsInserted,
		claimsWithdrawn,
		disagreements,
	}
}

import { canonicalize, type MediaEntry, mediaClaim } from '@prodid/core'

import type { Sql } from './client'
import { withRetry } from './client'

export interface MediaRow {
	sha256: string
	bytes: string
	content_type: string
	first_seen: Date
	blocked_at: Date | null
}

export async function findMedia(sql: Sql, sha256: string): Promise<MediaRow | null> {
	const rows = await sql<MediaRow[]>`
		select sha256, bytes::text, content_type, first_seen, blocked_at from media where sha256 = ${sha256}
	`
	return rows[0] ?? null
}

/**
 * Remembers a stored file. Two sources publishing the same bytes race on the digest, which is the
 * primary key, so the loser simply finds the winner's row.
 */
export async function recordMedia(sql: Sql, input: { sha256: string; bytes: number; contentType: string; now: Date }): Promise<void> {
	await sql`
		insert into media (sha256, bytes, content_type, first_seen)
		values (${input.sha256}, ${input.bytes}, ${input.contentType}, ${input.now})
		on conflict (sha256) do nothing
	`
}

/**
 * Puts a hash on the takedown list and withdraws every active claim naming it, in one transaction
 * with one timestamp. The upsert holds the row lock, so a claim being attached concurrently either
 * commits first and is withdrawn here, or waits and finds the hash blocked. Returns the number of
 * claims withdrawn; the file itself is deleted from R2 by the operator.
 */
export function blockMedia(sql: Sql, input: { sha256: string; reason: string; now: Date }): Promise<number> {
	return withRetry(() =>
		sql.begin(async (tx) => {
			await tx`
				insert into media (sha256, bytes, content_type, first_seen, blocked_at, blocked_reason)
				values (${input.sha256}, 0, 'application/octet-stream', ${input.now}, ${input.now}, ${input.reason})
				on conflict (sha256) do update set
					blocked_at = coalesce(media.blocked_at, excluded.blocked_at),
					blocked_reason = coalesce(media.blocked_reason, excluded.blocked_reason)
			`
			const withdrawn = await tx`
				update claim set withdrawn_at = ${input.now}
				where property = 'media' and withdrawn_at is null and value->>'sha256' = ${input.sha256}
			`
			return withdrawn.count
		}),
	)
}

export interface MediaClaimInput {
	source: string
	recordKey: string
	opid: string
	entry: MediaEntry
	sha256: string
	now: Date
}

/**
 * Stamps a claim as re-verified without touching what it says. `seen_at` means "since when this
 * source has asserted this value without stopping", so a re-check must not move it; `evidence`
 * carries when the file behind it was last read, which is what stops every crawl after day thirty
 * from fetching it again.
 */
export async function touchMediaClaim(
	sql: Sql,
	input: { source: string; recordKey: string; opid: string; url: string; now: Date },
): Promise<void> {
	await sql`
		update claim
		set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('checked_at', ${input.now}::timestamptz)
		where source = ${input.source} and record_key = ${input.recordKey} and opid = ${input.opid}
			and property = 'media' and withdrawn_at is null and value->>'url' = ${input.url}
	`
}

/**
 * Writes the `media` claim once the file behind it is stored. The claim's value carries the digest,
 * which is why it cannot be written with the rest of the record's claims at ingest.
 *
 * The same URL with different bytes is a different file, so the claim that named the old digest is
 * withdrawn in the same transaction: a reader never sees one URL claimed as two files at once.
 */
export function attachMediaClaim(sql: Sql, input: MediaClaimInput): Promise<boolean> {
	const claim = mediaClaim(input.entry, input.sha256)
	const canonical = canonicalize(claim.value)
	return withRetry(() =>
		sql.begin(async (tx) => {
			const stored = await tx<{ blocked: boolean }[]>`
				select blocked_at is not null as blocked from media where sha256 = ${input.sha256} for share
			`
			if (stored[0]?.blocked !== false) return false
			await tx`
				update claim set withdrawn_at = ${input.now}
				where source = ${input.source} and record_key = ${input.recordKey} and opid = ${input.opid}
					and property = 'media' and withdrawn_at is null
					and value->>'url' = ${input.entry.url} and value->>'sha256' <> ${input.sha256}
			`
			const already = await tx<{ id: string }[]>`
				select id::text from claim
				where source = ${input.source} and record_key = ${input.recordKey} and opid = ${input.opid}
					and property = 'media' and withdrawn_at is null and value = ${canonical}::text::jsonb
			`
			if (already.length > 0) {
				// The same bytes behind the same URL: nothing is asserted anew, only re-verified.
				await tx`
					update claim
					set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('checked_at', ${input.now}::timestamptz)
					where id = ${already[0]!.id}
				`
				return false
			}
			await tx`
				insert into claim (opid, property, value, lang, source, record_key, seen_at)
				values (${input.opid}, 'media', ${canonical}::text::jsonb, null, ${input.source}, ${input.recordKey}, ${input.now})
			`
			return true
		}),
	)
}

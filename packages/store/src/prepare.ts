import {
	canonicalize,
	deriveRecord,
	groupingDigests,
	type ItemRecord,
	type NormalizedIdentifier,
	type RecordIdentifier,
	sha256Hex,
} from '@prodid/core'

export interface PreparedClaim {
	property: string
	lang: string | null
	/** RFC 8785 canonical JSON. Every value reaches `claim.value` through this and nothing else. */
	canonical: string
}

export interface PreparedRecord {
	record: ItemRecord
	/** The record's canonical JSON. `jsonb` stores its own normal form, so this is what `body` holds. */
	canonical: string
	/** SHA-256 of the record's canonical JSON; it alone decides whether a re-crawl changed anything. */
	hash: string
	identifiers: NormalizedIdentifier[]
	rejected: RecordIdentifier[]
	claims: PreparedClaim[]
	familyKey: string
	variantKey: string
}

export type PrepareResult = { ok: true; prepared: PreparedRecord } | { ok: false; error: string }

/**
 * Everything the database needs for one validated record, computed before any transaction opens so
 * a value that has no canonical form costs its own line instead of the ingest.
 *
 * `media` is left in the record body and produces no claim here: a `media` claim's value is the file
 * the index stored, which does not exist until media ingest runs. `derived.media` is what is owed.
 */
export async function prepareRecord(record: ItemRecord, source: string): Promise<PrepareResult> {
	try {
		const derived = deriveRecord(record, { source })
		const claims: PreparedClaim[] = derived.claims.map((claim) => ({
			property: claim.property,
			lang: claim.lang,
			canonical: canonicalize(claim.value),
		}))
		const canonical = canonicalize(record)
		const [hash, digests] = await Promise.all([sha256Hex(canonical), groupingDigests(record, { source })])
		return {
			ok: true,
			prepared: {
				record,
				canonical,
				hash,
				identifiers: derived.identifiers,
				rejected: derived.rejected,
				claims,
				familyKey: digests.family,
				variantKey: digests.variant,
			},
		}
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
}

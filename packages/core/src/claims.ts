import { canonicalize, type JsonValue, sha256Hex } from './canonical'
import { normalizeIdentifier, type NormalizedIdentifier } from './identifier'
import type { ItemRecord, MediaEntry, MediaValue, PropertyValue, RecordIdentifier } from './record/types'

/** Where the index serves a stored file, and the only shape a media claim's `media_url` may take. */
export const MEDIA_URL_PREFIX = 'https://media.prodid.org/sha256/'

const SHA256_HEX = /^[0-9a-f]{64}$/

export interface Claim {
	property: string
	value: JsonValue
	/** The record's language, on claims whose value is text the publisher wrote. */
	lang: string | null
}

export interface GroupingKeys {
	family: string
	variant: string
}

/** The `grouping.key` values for a record: lowercase hex SHA-256 of each grouping key's UTF-8 bytes. */
export interface GroupingDigests {
	family: string
	variant: string
}

export interface SourceContext {
	/** The index's `source.id`. It scopes `sku` identifiers and every grouping key. */
	source: string
}

export interface DerivedRecord {
	identifiers: NormalizedIdentifier[]
	/** Identifiers that could not be normalized, such as a GTIN with a wrong check digit. */
	rejected: RecordIdentifier[]
	claims: Claim[]
	/**
	 * Media the publisher named, still to be fetched. It is not a claim yet and is kept out of
	 * `claims` on purpose: a media claim carries the digest of the stored file, which only ingest
	 * knows. Feed each entry to `mediaClaim` once the file is stored.
	 */
	media: MediaEntry[]
	keys: GroupingKeys
}

export function deriveIdentifiers(record: ItemRecord, context: SourceContext): Pick<DerivedRecord, 'identifiers' | 'rejected'> {
	const scope = { brand: record.brand, sourceScope: context.source }
	const identifiers: NormalizedIdentifier[] = []
	const rejected: RecordIdentifier[] = []
	for (const identifier of record.identifiers) {
		const normalized = normalizeIdentifier(identifier, scope)
		if (normalized === null) rejected.push(identifier)
		else identifiers.push(normalized)
	}
	return { identifiers, rejected }
}

export function deriveClaims(record: ItemRecord): Claim[] {
	const lang = record.lang ?? null
	const claims: Claim[] = [
		{ property: 'brand', value: record.brand, lang },
		{ property: 'name', value: record.name, lang },
	]
	if (record.category !== undefined) claims.push({ property: 'category', value: record.category, lang: null })
	// One claim per market: the schema declares a set, so reordering the list must not withdraw anything.
	for (const market of record.markets ?? []) claims.push({ property: 'markets', value: market, lang: null })
	for (const axis of sortedKeys(record.variant)) {
		claims.push({ property: `variant.${axis}`, value: record.variant![axis]!, lang })
	}
	for (const name of sortedKeys(record.properties)) {
		const value = record.properties![name]!
		claims.push({ property: `properties.${name}`, value: propertyToJson(value), lang: isText(value) ? lang : null })
	}
	// No media claim here: it needs the digest of the stored file. See `DerivedRecord.media`.
	return claims
}

/** Media the publisher named, in the order it was published, still to be fetched. */
export function pendingMedia(record: ItemRecord): MediaEntry[] {
	return (record.media ?? []).map((entry) => (entry.kind === undefined ? { url: entry.url, license: entry.license } : { ...entry }))
}

/**
 * Completes one pending media entry into the `media` claim `org.prodid.entity` defines, once ingest
 * has stored the file and knows its digest. This is the only way to build one: nothing else can.
 */
export function mediaClaim(entry: MediaEntry, sha256: string): Claim {
	if (!SHA256_HEX.test(sha256)) throw new RangeError(`not a SHA-256 digest: ${sha256}`)
	const value: MediaValue = {
		sha256,
		url: entry.url,
		media_url: `${MEDIA_URL_PREFIX}${sha256}`,
		license: entry.license,
		...(entry.kind === undefined ? {} : { kind: entry.kind }),
	}
	return { property: 'media', value: { ...value }, lang: null }
}

/**
 * The keys the index groups on. A family is one publisher `group`, or the record itself when the
 * publisher sends no group; a variant is a family plus the axes that distinguish it.
 */
export function groupingKeys(record: ItemRecord, context: SourceContext): GroupingKeys {
	const family = canonicalize(
		record.group === undefined ? { key: record.key, source: context.source } : { group: record.group, source: context.source },
	)
	return { family, variant: canonicalize({ family, variant: record.variant ?? {} }) }
}

/**
 * The `grouping.key` a row is stored under, for both kinds. It is the digest of the key string, not
 * of its JSON, so it is never `canonicalHash` of the key: that would hash the quotes around it.
 */
export async function groupingDigests(record: ItemRecord, context: SourceContext): Promise<GroupingDigests> {
	const keys = groupingKeys(record, context)
	const [family, variant] = await Promise.all([sha256Hex(keys.family), sha256Hex(keys.variant)])
	return { family, variant }
}

export function deriveRecord(record: ItemRecord, context: SourceContext): DerivedRecord {
	return {
		...deriveIdentifiers(record, context),
		claims: deriveClaims(record),
		media: pendingMedia(record),
		keys: groupingKeys(record, context),
	}
}

function sortedKeys(value: Record<string, unknown> | undefined): string[] {
	return value === undefined ? [] : Object.keys(value).sort()
}

function isText(value: PropertyValue): boolean {
	return typeof value === 'string' || Array.isArray(value)
}

function propertyToJson(value: PropertyValue): JsonValue {
	if (Array.isArray(value)) return [...value]
	if (typeof value === 'object') return { value: value.value, unit: value.unit }
	return value
}

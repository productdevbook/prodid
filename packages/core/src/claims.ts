import { canonicalize, type JsonValue } from './canonical'
import { normalizeIdentifier, type NormalizedIdentifier } from './identifier'
import type { ItemRecord, MediaEntry, PropertyValue, RecordIdentifier } from './record/types'

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

export interface SourceContext {
	/** The index's `source.id`. It scopes `sku` identifiers and every grouping key. */
	source: string
}

export interface DerivedRecord {
	identifiers: NormalizedIdentifier[]
	/** Identifiers that could not be normalized, such as a GTIN with a wrong check digit. */
	rejected: RecordIdentifier[]
	claims: Claim[]
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
	for (const entry of record.media ?? []) {
		claims.push({ property: 'media', value: mediaToJson(entry), lang: null })
	}
	return claims
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

export function deriveRecord(record: ItemRecord, context: SourceContext): DerivedRecord {
	return { ...deriveIdentifiers(record, context), claims: deriveClaims(record), keys: groupingKeys(record, context) }
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

function mediaToJson(entry: MediaEntry): JsonValue {
	return entry.kind === undefined
		? { url: entry.url, license: entry.license }
		: { url: entry.url, license: entry.license, kind: entry.kind }
}

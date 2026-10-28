import { parseGtin } from '../gtin'
import { validateItem } from '../record/index'
import type { ItemRecord, RecordIdentifier } from '../record/types'

export const WIKIDATA_GTIN = 'P3962'
export const WIKIDATA_BRAND = 'P1716'

const ITEM_ID = /^Q[1-9][0-9]*$/

export type WikidataSkip = 'not-an-item' | 'no-gtin' | 'no-brand' | 'no-label' | 'invalid'

export type WikidataResult =
	| {
			id: string
			ok: true
			record: ItemRecord
			/** Values the entity states that did not make it into the record, reported rather than dropped silently. */
			dropped: string[]
	  }
	| { id: string | null; ok: false; skip: WikidataSkip; reason: string }

/**
 * Turns one entity of a Wikidata JSON dump into an `org.prodid.item`, or says why it is skipped.
 * `brandLabel` answers the English label of a brand's QID, as `wikidataEnglishLabel` reads it off
 * that brand's own entity; the importer collects them in a pass of its own.
 */
export function mapWikidataEntity(entity: unknown, brandLabel: (id: string) => string | undefined): WikidataResult {
	const id = itemId(entity)
	if (id === null) return { id: null, ok: false, skip: 'not-an-item', reason: 'not a Wikidata item' }

	const dropped: string[] = []
	const identifiers: RecordIdentifier[] = []
	const seen = new Set<string>()
	for (const written of statementValues(entity, WIKIDATA_GTIN).filter((value) => typeof value === 'string')) {
		const gtin = parseGtin(written)
		if (!gtin.ok) dropped.push(`${WIKIDATA_GTIN}: ${written} (${gtin.problem})`)
		else if (!seen.has(gtin.value)) {
			seen.add(gtin.value)
			identifiers.push({ scheme: 'gtin', value: written.trim() })
		}
	}
	if (identifiers.length === 0) return { id, ok: false, skip: 'no-gtin', reason: `no valid ${WIKIDATA_GTIN}` }

	let brand: string | null = null
	for (const brandId of wikidataBrandIds(entity)) {
		const label = brandLabel(brandId)?.trim() ?? ''
		if (brand === null && label !== '') brand = label
		else dropped.push(`${WIKIDATA_BRAND}: ${brandId}`)
	}
	if (brand === null) return { id, ok: false, skip: 'no-brand', reason: `no ${WIKIDATA_BRAND} with an English label` }

	const name = wikidataEnglishLabel(entity)
	if (name === null) return { id, ok: false, skip: 'no-label', reason: 'no English label' }

	const validated = validateItem({ $type: 'org.prodid.item', key: id, brand, name, lang: 'en', identifiers })
	if (!validated.ok) {
		const first = validated.errors[0]
		return { id, ok: false, skip: 'invalid', reason: first === undefined ? 'invalid record' : `${first.path} ${first.message}` }
	}
	return { id, ok: true, record: validated.value, dropped }
}

/** The QIDs of an item's brands, best rank only, in the order the entity states them. */
export function wikidataBrandIds(entity: unknown): string[] {
	if (itemId(entity) === null) return []
	const ids = statementValues(entity, WIKIDATA_BRAND).flatMap((value) => {
		const brandId = isObject(value) ? value.id : undefined
		return typeof brandId === 'string' && ITEM_ID.test(brandId) ? [brandId] : []
	})
	return [...new Set(ids)]
}

/** The entity's English label, trimmed, or null when it has none. */
export function wikidataEnglishLabel(entity: unknown): string | null {
	if (!isObject(entity) || !isObject(entity.labels)) return null
	const english = entity.labels.en
	const value = isObject(english) && typeof english.value === 'string' ? english.value.trim() : ''
	return value === '' ? null : value
}

function itemId(entity: unknown): string | null {
	if (!isObject(entity) || entity.type !== 'item' || typeof entity.id !== 'string') return null
	return ITEM_ID.test(entity.id) ? entity.id : null
}

/**
 * The values of a property's statements at their best rank, as Wikidata's own truthy statements
 * read them: the preferred ones when there are any, else the normal ones, never the deprecated.
 * A statement whose value is "unknown value" or "no value" carries none.
 */
function statementValues(entity: unknown, property: string): unknown[] {
	if (!isObject(entity) || !isObject(entity.claims)) return []
	const statements = entity.claims[property]
	if (!Array.isArray(statements)) return []
	const ranked = statements.filter(isObject)
	const preferred = ranked.filter((statement) => statement.rank === 'preferred')
	const best = preferred.length > 0 ? preferred : ranked.filter((statement) => statement.rank === 'normal')
	return best.flatMap((statement) => {
		const snak = statement.mainsnak
		if (!isObject(snak) || snak.snaktype !== 'value' || !isObject(snak.datavalue)) return []
		return [snak.datavalue.value]
	})
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

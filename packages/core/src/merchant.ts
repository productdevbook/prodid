import { isIngestibleLicence } from './media'
import { validateItem } from './record/index'
import type { ItemRecord, MediaEntry, PropertyValue, RecordIdentifier } from './record/types'

/**
 * The Merchant columns that become variant axes, in the order they are written. Google lists six
 * attributes as distinguishing products inside an `item_group_id`; these four are the ones a buyer
 * picks between. `gender` and `age_group` describe the whole group and stay properties.
 */
export const MERCHANT_VARIANT_AXES: readonly string[] = ['color', 'size', 'material', 'pattern']

/**
 * The Merchant attributes written either as one comma-separated cell or as a repeated header, and
 * which always produce a list, so a consumer never has to handle two shapes.
 */
export const MERCHANT_REPEATED: readonly string[] = [
	'additional_image_link',
	'product_type',
	'product_highlight',
	'product_detail',
	'certification',
]

/** Merchant columns carried straight to `properties`, in the order the records write them. */
const PROPERTY_COLUMNS: [column: string, property: string][] = [
	['description', 'description'],
	['gender', 'gender'],
	['age_group', 'ageGroup'],
	['size_type', 'sizeType'],
	['size_system', 'sizeSystem'],
	['google_product_category', 'googleProductCategory'],
]

const DIMENSION_COLUMNS: [column: string, property: string][] = [
	['product_weight', 'weight'],
	['product_length', 'length'],
	['product_width', 'width'],
	['product_height', 'height'],
]

const PROPERTY_KEY = /^[a-z][A-Za-z0-9]*$/
const DIMENSION = /^(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)\s*([A-Za-z]+)$/
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/

export interface MerchantDeclaration {
	/** BCP 47 tag for every record in the file: a Merchant file is one language. */
	lang?: string
	/** ISO 3166-1 alpha-2 codes every record in the file is sold in. */
	markets?: string[]
	/** SPDX identifier covering every image and document in the file. A row's own wins over it. */
	license?: string
}

export interface MerchantRow {
	row: number
	/** One entry per column carrying that header, as `readDelimited` yields them. */
	values: Record<string, string[]>
}

export type MerchantResult =
	| {
			row: number
			ok: true
			record: ItemRecord
			/** Merchant values that had no home in the record, reported rather than dropped silently. */
			dropped: string[]
	  }
	| { row: number; ok: false; reason: string }

/**
 * Turns one row of a Google Merchant product file into an `org.prodid.item`, or says why it cannot.
 * A Merchant file describes offers; this keeps what the product is and drops what the seller is
 * doing with it today — price, availability, shipping, condition and the storefront link.
 */
export function importMerchantRow(row: MerchantRow, declared: MerchantDeclaration = {}): MerchantResult {
	const cells = (column: string): string[] => row.values[column] ?? []
	const one = (column: string): string => cells(column)[0]?.trim() ?? ''
	/**
	 * A cell is split on commas only when its header appears once in the file; when the header is
	 * repeated, every cell under it is taken whole. That is what makes the repeated form the way to
	 * carry a value with a comma in it, since in one cell a comma always separates.
	 */
	const many = (column: string): string[] => {
		const written = cells(column)
		const parts = written.length > 1 ? written : (written[0] ?? '').split(',')
		return parts.map((part) => part.trim()).filter((part) => part !== '')
	}

	const key = one('id')
	if (key === '') return { row: row.row, ok: false, reason: 'no id' }

	const dropped: string[] = []
	const identifiers: RecordIdentifier[] = []
	if (one('gtin') !== '') identifiers.push({ scheme: 'gtin', value: one('gtin') })
	if (one('mpn') !== '') identifiers.push({ scheme: 'mpn', value: one('mpn') })
	identifiers.push({ scheme: 'sku', value: key })

	const record: Record<string, unknown> = {
		$type: 'org.prodid.item',
		key,
		brand: one('brand'),
		name: one('title'),
	}
	if (declared.lang !== undefined) record.lang = declared.lang
	if (one('item_group_id') !== '') record.group = one('item_group_id')

	const variant: Record<string, string> = {}
	for (const axis of MERCHANT_VARIANT_AXES) {
		if (one(axis) !== '') variant[axis] = one(axis)
	}
	if (Object.keys(variant).length > 0) record.variant = variant

	record.identifiers = identifiers
	if (declared.markets !== undefined && declared.markets.length > 0) record.markets = [...declared.markets]

	const properties = readProperties(one, many, dropped)
	if (Object.keys(properties).length > 0) record.properties = properties

	const media = readMedia(one, many, declared, dropped)
	if (media.length > 0) record.media = media

	const validated = validateItem(record)
	if (!validated.ok) {
		const first = validated.errors[0]
		return { row: row.row, ok: false, reason: first === undefined ? 'invalid record' : `${first.path} ${first.message}` }
	}
	return { row: row.row, ok: true, record: validated.value, dropped }
}

function readProperties(
	one: (column: string) => string,
	many: (column: string) => string[],
	dropped: string[],
): Record<string, PropertyValue> {
	const properties: Record<string, PropertyValue> = {}
	for (const [column, property] of PROPERTY_COLUMNS) {
		if (one(column) !== '') properties[property] = one(column)
	}
	const productType = many('product_type')
	if (productType.length > 0) properties.productType = productType
	const highlights = many('product_highlight')
	if (highlights.length > 0) properties.highlights = highlights
	const certification = many('certification')
	if (certification.length > 0) properties.certification = certification

	if (one('energy_efficiency_class') !== '') properties.energyEfficiencyClass = one('energy_efficiency_class')
	if (one('multipack') !== '') {
		// The specification's format for it is "Integer".
		if (INTEGER.test(one('multipack'))) properties.multipack = Number(one('multipack'))
		else dropped.push(`multipack: ${one('multipack')}`)
	}
	if (one('is_bundle') !== '') {
		// The specification's supported values are yes and no.
		const bundle = one('is_bundle').toLowerCase()
		if (bundle === 'yes' || bundle === 'no') properties.isBundle = bundle === 'yes'
		else dropped.push(`is_bundle: ${one('is_bundle')}`)
	}

	for (const [column, property] of DIMENSION_COLUMNS) {
		if (one(column) === '') continue
		const dimension = parseDimension(one(column))
		if (dimension === null) dropped.push(`${column}: ${one(column)}`)
		else properties[property] = dimension
	}
	// A detail never overwrites: the first value for a key wins, and the mapped properties above are
	// already there, so a product_detail cannot quietly redefine what the rest of the row said.
	for (const detail of many('product_detail')) {
		const named = parseDetail(detail)
		if (named === null || Object.hasOwn(properties, named.property)) dropped.push(`product_detail: ${detail}`)
		else properties[named.property] = named.value
	}
	return properties
}

function readMedia(
	one: (column: string) => string,
	many: (column: string) => string[],
	declared: MerchantDeclaration,
	dropped: string[],
): MediaEntry[] {
	const licence = one('license') === '' ? declared.license : one('license')
	// Only additional_image_link is a repeated attribute; the other two are taken whole.
	const images = [one('image_link'), ...many('additional_image_link')].filter((url) => url !== '')
	const documents = [one('document_link')].filter((url) => url !== '')
	if (licence === undefined || !isIngestibleLicence(licence)) {
		// A licence we cannot redistribute under costs the media, never the record.
		for (const url of [...images, ...documents]) dropped.push(`media: ${url}`)
		return []
	}
	return [
		...images.map((url): MediaEntry => ({ url, license: licence, kind: 'image' })),
		...documents.map((url): MediaEntry => ({ url, license: licence, kind: 'document' })),
	]
}

/** `480 g` becomes `{ value: 480, unit: 'g' }`; anything else is reported rather than guessed at. */
function parseDimension(text: string): { value: number; unit: string } | null {
	const match = DIMENSION.exec(text.trim())
	if (match === null) return null
	return { value: Number(match[1]), unit: match[2]! }
}

/**
 * A detail is a section name, an attribute name and a value, colon-separated. The attribute name
 * becomes the property key: lowercased, spaces, underscores and hyphens dropped, each word after
 * the first capitalized, so `Machine wash` becomes `machineWash`.
 */
function parseDetail(detail: string): { property: string; value: string } | null {
	const parts = detail.split(':')
	if (parts.length !== 3) return null
	const property = camelCase(parts[1]!)
	if (property === null) return null
	const value = parts[2]!.trim()
	return value === '' ? null : { property, value }
}

function camelCase(name: string): string | null {
	const words = name
		.trim()
		.toLowerCase()
		.split(/[\s_-]+/u)
		.filter(Boolean)
	if (words.length === 0) return null
	const key = words.map((word, index) => (index === 0 ? word : word[0]!.toUpperCase() + word.slice(1))).join('')
	return PROPERTY_KEY.test(key) ? key : null
}

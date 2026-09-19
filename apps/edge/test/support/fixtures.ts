import type { FeedRecord, ItemRecord } from '@prodid/core'
import { gtinCheckDigit } from '@prodid/core'

/** A GTIN-13 from a 12-digit body, with the check digit core computes. */
export function gtin13(body: string): string {
	if (body.length !== 12) throw new RangeError('a GTIN-13 body is 12 digits')
	return `${body}${gtinCheckDigit(body)}`
}

export const GTINS = {
	navy: gtin13('400638133393'),
	black: gtin13('400638133416'),
	olive: gtin13('400638133430'),
	other: gtin13('400638133454'),
	// GS1 prefix 20 is restricted: it identifies nothing outside whoever issued it.
	restricted: gtin13('200638133390'),
} as const

export function document(options: {
	domain?: string
	feeds: string[]
	license?: string
	publisher?: { name: string; contact?: string }
}): FeedRecord {
	const record: FeedRecord = {
		$type: 'org.prodid.feed',
		version: 0,
		publisher: options.publisher ?? { name: 'Acme', contact: 'data@acme.example' },
		license: options.license ?? 'CC0-1.0',
		feeds: options.feeds,
	}
	if (options.domain !== undefined) record.domain = options.domain
	return record
}

export function item(options: {
	key: string
	name?: string
	brand?: string
	group?: string
	variant?: Record<string, string>
	gtin?: string
	sku?: string
	markets?: string[]
	properties?: Record<string, string | number | boolean | string[]>
	lang?: string
}): ItemRecord {
	const identifiers = [
		...(options.gtin === undefined ? [] : [{ scheme: 'gtin', value: options.gtin }]),
		...(options.sku === undefined ? [] : [{ scheme: 'sku', value: options.sku }]),
	]
	const record: ItemRecord = {
		$type: 'org.prodid.item',
		key: options.key,
		brand: options.brand ?? 'Acme',
		name: options.name ?? 'Trail Jacket',
		identifiers,
	}
	record.lang = options.lang ?? 'en'
	if (options.group !== undefined) record.group = options.group
	if (options.variant !== undefined) record.variant = options.variant
	if (options.markets !== undefined) record.markets = options.markets
	if (options.properties !== undefined) record.properties = options.properties
	return record
}

export const JACKET = {
	navy: item({ key: 'tj-navy-m', group: 'trail-jacket', variant: { color: 'Navy', size: 'M' }, gtin: GTINS.navy, sku: 'TJ-NV-M' }),
	black: item({ key: 'tj-black-m', group: 'trail-jacket', variant: { color: 'Black', size: 'M' }, gtin: GTINS.black, sku: 'TJ-BK-M' }),
	olive: item({ key: 'tj-olive-m', group: 'trail-jacket', variant: { color: 'Olive', size: 'M' }, gtin: GTINS.olive, sku: 'TJ-OL-M' }),
}

import { describe, expect, test } from 'bun:test'

import { canonicalize } from '../src/canonical'
import { deriveRecord, groupingKeys } from '../src/claims'
import { validateItem } from '../src/record/index'
import type { ItemRecord } from '../src/record/types'

const source = 'acme.example'

async function loadItem(name: string): Promise<ItemRecord> {
	const parsed = validateItem(await Bun.file(new URL(`../../../spec/${name}`, import.meta.url)).json())
	if (!parsed.ok) throw new Error(`${name} is not a valid item: ${JSON.stringify(parsed.errors)}`)
	return parsed.value
}

const jacket = await loadItem('examples/item.jacket.json')
const bottle = await loadItem('fixtures/valid/item.minimal.json')

describe('deriveRecord', () => {
	test('normalizes the identifiers of the jacket example', () => {
		const derived = deriveRecord(jacket, { source })
		expect(derived.identifiers).toEqual([
			{ scheme: 'gtin', scope: '', value: '09506000134352' },
			{ scheme: 'mpn', scope: 'acme', value: 'TJ-2041-NVY-M' },
		])
		expect(derived.rejected).toEqual([])
	})

	test('derives one claim per published fact', () => {
		const derived = deriveRecord(jacket, { source })
		expect(derived.claims).toEqual([
			{ property: 'brand', value: 'Acme', lang: 'en' },
			{ property: 'name', value: 'Trail Jacket', lang: 'en' },
			{ property: 'markets', value: 'TR', lang: null },
			{ property: 'markets', value: 'DE', lang: null },
			{ property: 'variant.color', value: 'navy', lang: 'en' },
			{ property: 'variant.size', value: 'M', lang: 'en' },
			{ property: 'properties.madeIn', value: 'TR', lang: 'en' },
			{ property: 'properties.material', value: '100% recycled polyester', lang: 'en' },
			{ property: 'properties.weight', value: { value: 480, unit: 'g' }, lang: null },
			{ property: 'media', value: { url: 'https://acme.example/img/tj2041-navy.webp', license: 'CC-BY-4.0', kind: 'image' }, lang: null },
		])
	})

	test('groups the jacket by its publisher group', () => {
		const derived = deriveRecord(jacket, { source })
		expect(derived.keys.family).toBe(canonicalize({ group: 'TJ-2041', source }))
		expect(derived.keys.variant).toBe(canonicalize({ family: derived.keys.family, variant: { color: 'navy', size: 'M' } }))
	})

	test('reports an identifier it cannot normalize instead of dropping it', () => {
		const broken: ItemRecord = { ...jacket, identifiers: [{ scheme: 'gtin', value: '09506000134353' }, ...jacket.identifiers] }
		const derived = deriveRecord(broken, { source })
		expect(derived.rejected).toEqual([{ scheme: 'gtin', value: '09506000134353' }])
		expect(derived.identifiers).toHaveLength(2)
	})

	test('leaves lang null when the record does not declare one', () => {
		const derived = deriveRecord(bottle, { source })
		expect(derived.claims).toEqual([
			{ property: 'brand', value: 'Acme', lang: null },
			{ property: 'name', value: 'Trail Bottle 1L', lang: null },
		])
	})
})

describe('markets', () => {
	test('reordering a market list withdraws nothing, because the schema declares a set', () => {
		const forward = deriveRecord(jacket, { source }).claims.filter((claim) => claim.property === 'markets')
		const backward = deriveRecord({ ...jacket, markets: ['DE', 'TR'] }, { source }).claims.filter((claim) => claim.property === 'markets')
		expect(forward).toHaveLength(2)
		expect(new Set(forward.map((claim) => claim.value))).toEqual(new Set(backward.map((claim) => claim.value)))
		for (const claim of forward) expect(typeof claim.value).toBe('string')
	})
})

describe('groupingKeys', () => {
	test('variants of one group share a family key and differ by variant key', () => {
		const navy = groupingKeys(jacket, { source })
		const olive = groupingKeys({ ...jacket, key: 'TJ-2041-OLV-M', variant: { color: 'olive', size: 'M' } }, { source })
		expect(olive.family).toBe(navy.family)
		expect(olive.variant).not.toBe(navy.variant)
	})

	test('the axis order a publisher writes does not matter', () => {
		const written = groupingKeys({ ...jacket, variant: { size: 'M', color: 'navy' } }, { source })
		expect(written.variant).toBe(groupingKeys(jacket, { source }).variant)
	})

	test('a record with no group is its own family', () => {
		expect(groupingKeys(bottle, { source }).family).toBe(canonicalize({ key: 'TB-100', source }))
	})

	test('a group never collides with a record key of the same text', () => {
		const grouped = groupingKeys({ ...bottle, group: 'TB-100' }, { source })
		expect(grouped.family).not.toBe(groupingKeys(bottle, { source }).family)
	})

	test('the same group under two sources is two families', () => {
		expect(groupingKeys(jacket, { source }).family).not.toBe(groupingKeys(jacket, { source: 'rival.example' }).family)
	})
})

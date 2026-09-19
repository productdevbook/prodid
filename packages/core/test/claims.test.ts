import { describe, expect, test } from 'bun:test'

import { canonicalHash, canonicalize, sha256Hex } from '../src/canonical'
import { deriveRecord, groupingDigests, groupingKeys, mediaClaim } from '../src/claims'
import { validateEntity, validateItem } from '../src/record/index'
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

describe('groupingDigests', () => {
	test('is the digest of the key string, pinned so it can never drift', async () => {
		// grouping.key in the index contract: lowercase hex SHA-256 of the key string's UTF-8 bytes.
		expect(await groupingDigests(jacket, { source })).toEqual({
			family: 'dfb8a40ccc3dfa21c2578d9d71ed008ec9d832fc6a9ec1b634a3880ee3c8409d',
			variant: '4e8271cccf532ad4187607b5669b0d06f0145eacd76e34d490f1d49b63697133',
		})
	})

	test('is not canonicalHash of the key, which hashes the quotes around it', async () => {
		const keys = groupingKeys(jacket, { source })
		const digests = await groupingDigests(jacket, { source })
		expect(digests.family).toBe(await sha256Hex(keys.family))
		expect(digests.family).not.toBe(await canonicalHash(keys.family))
		expect(await canonicalHash(keys.family)).toBe('dc503717686b0db2ae3a280d0d64d71627a86400a3e386728e965fd147ccc6f3')
	})

	test('tracks the keys: one family for a group, one variant per axis combination', async () => {
		const navy = await groupingDigests(jacket, { source })
		const olive = await groupingDigests({ ...jacket, key: 'TJ-2041-OLV-M', variant: { color: 'olive', size: 'M' } }, { source })
		expect(olive.family).toBe(navy.family)
		expect(olive.variant).not.toBe(navy.variant)
		expect(navy.family).toMatch(/^[0-9a-f]{64}$/)
	})
})

describe('media', () => {
	const SHA = 'e3943ea26ce08ae81809e62936dc4f934fa04da6cd57bd9ab2a90b79da751c09'

	test('is carried as pending media, never as a claim, because a claim needs the stored digest', () => {
		const derived = deriveRecord(jacket, { source })
		expect(derived.claims.some((claim) => claim.property === 'media')).toBe(false)
		expect(derived.media).toEqual([{ url: 'https://acme.example/img/tj2041-navy.webp', license: 'CC-BY-4.0', kind: 'image' }])
		expect(deriveRecord(bottle, { source }).media).toEqual([])
	})

	test('mediaClaim completes one entry into what org.prodid.entity requires', () => {
		expect(mediaClaim({ url: 'https://acme.example/a.webp', license: 'CC0-1.0', kind: 'image' }, SHA)).toEqual({
			property: 'media',
			lang: null,
			value: {
				sha256: SHA,
				url: 'https://acme.example/a.webp',
				media_url: `https://media.prodid.org/sha256/${SHA}`,
				license: 'CC0-1.0',
				kind: 'image',
			},
		})
	})

	test('leaves kind out when the publisher did not say', () => {
		const claim = mediaClaim({ url: 'https://acme.example/a.pdf', license: 'CC0-1.0' }, SHA)
		expect(Object.keys(claim.value as object)).toEqual(['sha256', 'url', 'media_url', 'license'])
	})

	test('refuses a digest that is not one, rather than building a claim that cannot validate', () => {
		for (const digest of ['', 'nope', SHA.toUpperCase(), SHA.slice(0, 63), `${SHA}0`]) {
			expect(() => mediaClaim({ url: 'https://acme.example/a.webp', license: 'CC0-1.0' }, digest)).toThrow(RangeError)
		}
	})

	test('its output validates as an entity claim', () => {
		const derived = deriveRecord(jacket, { source })
		const claims = derived.media.map((entry) => {
			const { property, value } = mediaClaim(entry, SHA)
			return { property, value, source: { name: source, trust: 'verified', lapsed: false }, seen_at: '2026-09-14T09:12:03Z' }
		})
		expect(claims).toHaveLength(1)
		const entity = { $type: 'org.prodid.entity', opid: '3n7k2q9vdfhb4mta', kind: 'family', identifiers: [], claims }
		const result = validateEntity(entity)
		expect(result.ok ? [] : result.errors).toEqual([])
	})

	test('every derived claim validates as an entity claim', () => {
		const claims = deriveRecord(jacket, { source }).claims.map(({ property, value, lang }) => ({
			property,
			value,
			...(lang === null ? {} : { lang }),
			source: { name: source, trust: 'verified', lapsed: false },
			seen_at: '2026-09-14T09:12:03Z',
		}))
		const entity = { $type: 'org.prodid.entity', opid: '3n7k2q9vdfhb4mta', kind: 'family', identifiers: [], claims }
		const result = validateEntity(entity)
		expect(result.ok ? [] : result.errors).toEqual([])
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

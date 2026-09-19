import { describe, expect, test } from 'bun:test'

import { readDelimited } from '../src/delimited'
import { importMerchantRow, MERCHANT_REPEATED, MERCHANT_VARIANT_AXES, type MerchantDeclaration, type MerchantRow } from '../src/merchant'

const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)

const DECLARED: MerchantDeclaration = { lang: 'en', markets: ['TR'], license: 'CC-BY-4.0' }

/** A row as the reader yields it: every column a list, so a repeated header keeps its values apart. */
function cells(values: Record<string, string | string[]>): MerchantRow['values'] {
	return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, typeof value === 'string' ? [value] : value]))
}

function importOne(values: Record<string, string | string[]>, declared: MerchantDeclaration = DECLARED, row = 2) {
	return importMerchantRow({ row, values: cells(values) }, declared)
}

const ROW: Record<string, string> = {
	id: 'TJ-1',
	title: 'Trail Jacket',
	brand: 'Acme',
	gtin: '9506000134352',
	mpn: 'TJ-1-MPN',
	item_group_id: 'TJ',
	color: 'navy',
	size: 'M',
}

describe('the worked example the spec ships', () => {
	test('produces feed.ndjson line for line, and skips exactly the rows expected.json names', async () => {
		const expected = (await Bun.file(new URL('expected.json', MERCHANT)).json()) as Record<
			string,
			{ ndjson: string; declared: MerchantDeclaration; skipped_rows: number[]; dropped?: Record<string, string[]> }
		>
		expect(Object.keys(expected).length).toBeGreaterThan(0)

		for (const [name, want] of Object.entries(expected)) {
			const lines = (await Bun.file(new URL(want.ndjson, MERCHANT)).text()).trim().split('\n')
			const produced: string[] = []
			const skipped: number[] = []
			const dropped: Record<string, string[]> = {}
			for await (const entry of readDelimited(Bun.file(new URL(name, MERCHANT)).stream())) {
				if (!entry.ok) {
					skipped.push(entry.row)
					continue
				}
				const result = importMerchantRow({ row: entry.row, values: entry.values }, want.declared)
				if (!result.ok) {
					skipped.push(result.row)
					continue
				}
				produced.push(JSON.stringify(result.record))
				if (result.dropped.length > 0) dropped[String(result.row)] = result.dropped
			}
			expect(skipped).toEqual(want.skipped_rows)
			// Row 3 carries a detail that repeats a key and one that collides with a mapped property.
			expect(dropped).toEqual({
				'3': ['product_detail: Storage:Machine wash:cold', 'product_detail: Catalogue:Product type:ignored'],
			})
			expect(produced.length).toBe(lines.length)
			for (let at = 0; at < lines.length; at += 1) {
				if (produced[at] !== lines[at]) throw new Error(`${name} record ${at + 1}:\n  got  ${produced[at]}\n  want ${lines[at]}`)
			}
		}
	})
})

describe('importMerchantRow', () => {
	test('keeps the id as the key and as a sku, so the next import finds the record again', () => {
		const result = importOne(ROW)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.record.key).toBe('TJ-1')
		expect(result.record.identifiers).toEqual([
			{ scheme: 'gtin', value: '9506000134352' },
			{ scheme: 'mpn', value: 'TJ-1-MPN' },
			{ scheme: 'sku', value: 'TJ-1' },
		])
	})

	test('carries the declared language and markets onto every record', () => {
		const result = importOne(ROW)
		expect(result.ok && result.record.lang).toBe('en')
		expect(result.ok && result.record.markets).toEqual(['TR'])
		const bare = importOne(ROW, {})
		expect(bare.ok && bare.record.lang).toBeUndefined()
		expect(bare.ok && bare.record.markets).toBeUndefined()
	})

	test('makes axes of the four attributes a buyer picks between, and properties of the rest', () => {
		const result = importOne({ ...ROW, material: 'wool', pattern: 'plain', gender: 'unisex', age_group: 'adult', size_system: 'EU' })
		expect([...MERCHANT_VARIANT_AXES]).toEqual(['color', 'size', 'material', 'pattern'])
		expect(result.ok && result.record.variant).toEqual({ color: 'navy', size: 'M', material: 'wool', pattern: 'plain' })
		expect(result.ok && result.record.properties).toEqual({ gender: 'unisex', ageGroup: 'adult', sizeSystem: 'EU' })
	})

	test('drops the offer: price, availability, shipping, condition and the link', () => {
		const result = importOne({
			...ROW,
			price: '249.90 TRY',
			availability: 'in_stock',
			shipping: 'TR::5.00 TRY',
			condition: 'new',
			link: 'https://a.example/p',
		})
		expect(result.ok).toBe(true)
		if (!result.ok) return
		const carried = JSON.stringify(result.record)
		for (const gone of ['249.90', 'in_stock', 'shipping', 'condition', '/p']) expect(carried).not.toContain(gone)
	})

	test('carries both Google taxonomy fields verbatim and sets no category', () => {
		const google = 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets'
		const result = importOne({ ...ROW, google_product_category: google, product_type: 'Outerwear > Jackets' })
		expect(result.ok && result.record.properties).toMatchObject({
			googleProductCategory: google,
			productType: ['Outerwear > Jackets'],
		})
		expect(result.ok && result.record.category).toBeUndefined()
	})

	test('reads a repeated attribute from one cell and from repeated columns alike', () => {
		expect([...MERCHANT_REPEATED]).toEqual([
			'additional_image_link',
			'product_type',
			'product_highlight',
			'product_detail',
			'certification',
		])
		const inOneCell = importOne({ ...ROW, product_type: 'A > B,C > D' })
		const inColumns = importOne({ ...ROW, product_type: ['A > B', 'C > D'] })
		expect(inOneCell.ok && inOneCell.record.properties?.productType).toEqual(['A > B', 'C > D'])
		expect(inColumns.ok && inColumns.record.properties?.productType).toEqual(['A > B', 'C > D'])
	})

	test('a repeated attribute is always a list, even of one value', () => {
		const result = importOne({ ...ROW, product_type: 'A > B', certification: 'EC:EPREL:123456', product_highlight: 'Waterproof' })
		expect(result.ok && result.record.properties).toMatchObject({
			productType: ['A > B'],
			certification: ['EC:EPREL:123456'],
			highlights: ['Waterproof'],
		})
	})

	test('splits a cell only when its header appears once in the file', () => {
		// Repeated columns are how a value carrying a comma is written, so their cells are taken whole.
		const once = importOne({ ...ROW, product_type: 'A > B,C > D' })
		expect(once.ok && once.record.properties?.productType).toEqual(['A > B', 'C > D'])

		const repeated = importOne({ ...ROW, product_type: ['A > B', 'Clothing, Outerwear'] })
		expect(repeated.ok && repeated.record.properties?.productType).toEqual(['A > B', 'Clothing, Outerwear'])

		const withEmpty = importOne({ ...ROW, product_type: ['A > B', ''] })
		expect(withEmpty.ok && withEmpty.record.properties?.productType).toEqual(['A > B'])
	})

	test('a detail never overwrites, and the mapping is written first', () => {
		const result = importOne({
			...ROW,
			product_type: 'Outerwear > Jackets',
			product_detail: 'Care:Machine wash:30C,Storage:Machine wash:cold,Catalogue:Product type:ignored',
		})
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.record.properties?.machineWash).toBe('30C')
		expect(result.record.properties?.productType).toEqual(['Outerwear > Jackets'])
		expect(result.dropped).toEqual(['product_detail: Storage:Machine wash:cold', 'product_detail: Catalogue:Product type:ignored'])
	})

	test('image_link and document_link are taken whole, being no repeated attribute', () => {
		const result = importOne({ ...ROW, image_link: 'https://a.example/1.webp', document_link: 'https://a.example/m.pdf' })
		expect(result.ok && result.record.media).toEqual([
			{ url: 'https://a.example/1.webp', license: 'CC-BY-4.0', kind: 'image' },
			{ url: 'https://a.example/m.pdf', license: 'CC-BY-4.0', kind: 'document' },
		])
	})

	test('a value that is not repeated keeps its commas', () => {
		const result = importOne({ ...ROW, description: 'Three-layer shell, taped seams.' })
		expect(result.ok && result.record.properties?.description).toBe('Three-layer shell, taped seams.')
	})

	test('a percent-encoded comma in a URL survives the split', () => {
		const result = importOne({
			...ROW,
			image_link: 'https://a.example/1.webp',
			additional_image_link: 'https://a.example/a%2C2.webp,https://a.example/3.webp',
		})
		expect(result.ok && result.record.media?.map((entry) => entry.url)).toEqual([
			'https://a.example/1.webp',
			'https://a.example/a%2C2.webp',
			'https://a.example/3.webp',
		])
	})

	test('types multipack as a number and is_bundle as a boolean', () => {
		const result = importOne({ ...ROW, multipack: '6', is_bundle: 'yes' })
		expect(result.ok && result.record.properties).toMatchObject({ multipack: 6, isBundle: true })

		const no = importOne({ ...ROW, is_bundle: 'no' })
		expect(no.ok && no.record.properties?.isBundle).toBe(false)
		const bad = importOne({ ...ROW, multipack: 'six', is_bundle: 'maybe' })
		expect(bad.ok && bad.record.properties?.multipack).toBeUndefined()
		expect(bad.ok && bad.record.properties?.isBundle).toBeUndefined()
		expect(bad.ok && bad.dropped).toEqual(['multipack: six', 'is_bundle: maybe'])
	})

	test('reads a dimension as a value and a unit, and reports one it cannot', () => {
		const good = importOne({ ...ROW, product_weight: '480 g', product_length: '1.5 kg', product_height: '10in' })
		expect(good.ok && good.record.properties).toMatchObject({
			weight: { value: 480, unit: 'g' },
			length: { value: 1.5, unit: 'kg' },
			height: { value: 10, unit: 'in' },
		})
		const bad = importOne({ ...ROW, product_weight: 'heavy' })
		expect(bad.ok && bad.record.properties?.weight).toBeUndefined()
		expect(bad.ok && bad.dropped).toEqual(['product_weight: heavy'])
	})

	test('turns each product detail into one property, named from its middle sub-attribute', () => {
		const result = importOne({ ...ROW, product_detail: 'Care:Machine wash:30C,General:Fabric-weight:480 g' })
		expect(result.ok && result.record.properties).toMatchObject({ machineWash: '30C', fabricWeight: '480 g' })
	})

	test('drops and reports a detail that does not split into three, or cannot be a key', () => {
		const result = importOne({ ...ROW, product_detail: ['Care:Machine wash', 'Care:9 lives:yes', 'Care:Wash:30C:extra'] })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.record.properties?.machineWash).toBeUndefined()
		expect(result.dropped).toEqual([
			'product_detail: Care:Machine wash',
			'product_detail: Care:9 lives:yes',
			'product_detail: Care:Wash:30C:extra',
		])
	})

	test('turns image and document links into media under the declared licence', () => {
		const result = importOne({
			...ROW,
			image_link: 'https://a.example/1.webp',
			additional_image_link: ['https://a.example/2.webp', 'https://a.example/3.webp'],
			document_link: 'https://a.example/manual.pdf',
		})
		expect(result.ok && result.record.media).toEqual([
			{ url: 'https://a.example/1.webp', license: 'CC-BY-4.0', kind: 'image' },
			{ url: 'https://a.example/2.webp', license: 'CC-BY-4.0', kind: 'image' },
			{ url: 'https://a.example/3.webp', license: 'CC-BY-4.0', kind: 'image' },
			{ url: 'https://a.example/manual.pdf', license: 'CC-BY-4.0', kind: 'document' },
		])
	})

	test("a row's own licence column wins over the declaration", () => {
		const result = importOne({ ...ROW, image_link: 'https://a.example/1.webp', license: 'CC0-1.0' })
		expect(result.ok && result.record.media).toEqual([{ url: 'https://a.example/1.webp', license: 'CC0-1.0', kind: 'image' }])
	})

	test('a licence that cannot be ingested costs the media, never the record', () => {
		const result = importOne({ ...ROW, image_link: 'https://a.example/1.webp' }, { ...DECLARED, license: 'CC-BY-NC-4.0' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.record.media).toBeUndefined()
		expect(result.dropped).toEqual(['media: https://a.example/1.webp'])
		const undeclared = importOne({ ...ROW, image_link: 'https://a.example/1.webp' }, { lang: 'en' })
		expect(undeclared.ok && undeclared.record.media).toBeUndefined()
	})

	test('skips a row that cannot become a record, by its spreadsheet row number', () => {
		const wrongDigit = importMerchantRow({ row: 6, values: cells({ ...ROW, gtin: '9506000134353' }) }, DECLARED)
		expect(wrongDigit.ok).toBe(false)
		expect(wrongDigit.row).toBe(6)
		expect(!wrongDigit.ok && wrongDigit.reason).toContain('/identifiers/0/value')

		expect(importOne({ ...ROW, id: '' })).toEqual({ row: 2, ok: false, reason: 'no id' })
		expect(importOne({ ...ROW, title: '' }).ok).toBe(false)
		const blankBrand = importOne({ id: 'X', title: 'T', brand: '   ', mpn: 'M' })
		expect(blankBrand.ok).toBe(false)
		expect(!blankBrand.ok && blankBrand.reason).toContain('/brand')
	})

	test('the sku alone is enough to keep a row with no other identifier', () => {
		const result = importOne({ id: 'X-1', title: 'Thing', brand: 'Acme' })
		expect(result.ok).toBe(true)
		expect(result.ok && result.record.identifiers).toEqual([{ scheme: 'sku', value: 'X-1' }])
	})
})

import { describe, expect, test } from 'bun:test'

import { type IdentifierScope, normalizeBrand, normalizeIdentifier } from '../src/identifier'

describe('normalizeBrand', () => {
	test('applies NFKC, case folding and whitespace collapsing', () => {
		expect(normalizeBrand('  Acme   Tekstil\t')).toBe('acme tekstil')
		expect(normalizeBrand('ＡＣＭＥ')).toBe('acme')
		expect(normalizeBrand(`Acme${String.fromCharCode(0xa0)}Tekstil`)).toBe('acme tekstil')
		expect(normalizeBrand('ACME')).toBe(normalizeBrand('acme'))
	})
})

describe('normalizeIdentifier', () => {
	const scope = { brand: 'Acme Tekstil', sourceScope: '42' }

	test('normalizes a gtin to 14 digits in the global scope', () => {
		expect(normalizeIdentifier({ scheme: 'gtin', value: '9506000134420' }, scope)).toEqual({
			scheme: 'gtin',
			scope: '',
			value: '09506000134420',
		})
	})

	test('turns a restricted circulation number into an rcn scoped to the source', () => {
		// 20… is issued inside one region: as a global gtin it merged unrelated products across sources.
		expect(normalizeIdentifier({ scheme: 'gtin', value: '2001234567893' }, scope)).toEqual({
			scheme: 'rcn',
			scope: '42',
			value: '02001234567893',
		})
		expect(normalizeIdentifier({ scheme: 'gtin', value: '01234565' }, scope)?.scheme).toBe('rcn')
		expect(normalizeIdentifier({ scheme: 'rcn', value: 'X-1' }, scope)).toEqual({ scheme: 'rcn', scope: '42', value: 'X-1' })
	})

	test('rejects a gtin that does not check out', () => {
		expect(normalizeIdentifier({ scheme: 'gtin', value: '9506000134421' }, scope)).toBeNull()
		expect(normalizeIdentifier({ scheme: 'gtin', value: '95060001344' }, scope)).toBeNull()
		expect(normalizeIdentifier({ scheme: 'gtin', value: '0000000000000' }, scope)).toBeNull()
	})

	test('scopes an mpn to the normalized brand', () => {
		expect(normalizeIdentifier({ scheme: 'mpn', value: ' TJ-2041 ' }, scope)).toEqual({
			scheme: 'mpn',
			scope: 'acme tekstil',
			value: 'TJ-2041',
		})
		// An unscoped mpn would sit in the global namespace beside every other brand's part numbers.
		expect(normalizeIdentifier({ scheme: 'mpn', value: 'TJ-2041' }, {})).toBeNull()
		expect(normalizeIdentifier({ scheme: 'mpn', value: 'TJ-2041' }, { brand: '   ' })).toBeNull()
	})

	test('scopes a sku to the source id and leaves that id alone', () => {
		expect(normalizeIdentifier({ scheme: 'sku', value: 'ACME-TJ2041' }, scope)).toEqual({
			scheme: 'sku',
			scope: '42',
			value: 'ACME-TJ2041',
		})
		// The index stores the scope of a sku or rcn as source.id, and its check constraint wants digits.
		expect(normalizeIdentifier({ scheme: 'sku', value: 'x' }, { sourceScope: 'acme.example' })).toBeNull()
		expect(normalizeIdentifier({ scheme: 'sku', value: 'x' }, { sourceScope: '' })).toBeNull()
		expect(normalizeIdentifier({ scheme: 'sku', value: 'x' }, {})).toBeNull()
		expect(normalizeIdentifier({ scheme: 'gtin', value: '2001234567893' }, { brand: 'Acme' })).toBeNull()
	})

	test('leaves every other scheme global and only trims the value', () => {
		expect(normalizeIdentifier({ scheme: 'ASIN', value: ' B000000000 ' }, scope)).toEqual({
			scheme: 'asin',
			scope: '',
			value: 'B000000000',
		})
		expect(normalizeIdentifier({ scheme: 'oeko-tex', value: 'SH025 123456' }, scope)).toEqual({
			scheme: 'oeko-tex',
			scope: '',
			value: 'SH025 123456',
		})
	})

	test('never produces a scope the index would refuse to store', () => {
		// identifier's check constraint: mpn non-empty, sku and rcn digits, every other scheme empty.
		const scopes: IdentifierScope[] = [{}, scope, { brand: 'Acme' }, { sourceScope: '7' }, { brand: '  ', sourceScope: 'x' }]
		const identifiers = [
			{ scheme: 'gtin', value: '9506000134420' },
			{ scheme: 'gtin', value: '2001234567893' },
			{ scheme: 'mpn', value: 'TJ-1' },
			{ scheme: 'sku', value: 'S-1' },
			{ scheme: 'rcn', value: 'R-1' },
			{ scheme: 'asin', value: 'B000000000' },
			{ scheme: 'oeko-tex', value: 'SH025 123456' },
		]
		for (const candidate of scopes) {
			for (const identifier of identifiers) {
				const normalized = normalizeIdentifier(identifier, candidate)
				if (normalized === null) continue
				if (normalized.scheme === 'mpn') expect(normalized.scope).not.toBe('')
				else if (normalized.scheme === 'sku' || normalized.scheme === 'rcn') expect(normalized.scope).toMatch(/^[0-9]+$/)
				else expect(normalized.scope).toBe('')
			}
		}
	})

	test('rejects an empty scheme or value', () => {
		expect(normalizeIdentifier({ scheme: '', value: 'x' }, scope)).toBeNull()
		expect(normalizeIdentifier({ scheme: 'sku', value: '   ' }, scope)).toBeNull()
	})
})

describe('brand vectors', () => {
	const VECTORS = new URL('../../../spec/fixtures/brand/', import.meta.url)

	test('agree with every vector the spec ships', async () => {
		const names: string[] = []
		for await (const name of new Bun.Glob('*.json').scan({ cwd: VECTORS.pathname })) names.push(name)
		expect(names.length).toBeGreaterThan(0)
		for (const name of names.sort()) {
			const { input, normalized } = (await Bun.file(new URL(name, VECTORS)).json()) as { input: string; normalized: string }
			const got = normalizeBrand(input)
			if (got !== normalized) throw new Error(`fixtures/brand/${name}: expected ${JSON.stringify(normalized)}, got ${JSON.stringify(got)}`)
		}
	})

	test('one Turkish brand stays one mpn scope', () => {
		// Splitting was the harm: ARÇELİK and Arçelik, or IŞIK and Işık, were two or three scopes.
		expect(normalizeBrand('ARÇELİK')).toBe(normalizeBrand('Arçelik'))
		expect(new Set(['IŞIK', 'Işık', 'ışık', 'IŞIk'].map((brand) => normalizeBrand(brand))).size).toBe(1)
		const scoped = (brand: string): string | undefined => normalizeIdentifier({ scheme: 'mpn', value: 'TJ-1' }, { brand })?.scope
		expect(scoped('ARÇELİK')).toBe(scoped('Arçelik')!)
	})
})

describe('normalizeBrand is idempotent', () => {
	const ALPHABET = [
		'i',
		'I',
		'İ',
		'ı',
		'̇',
		'̧',
		'́',
		'̈',
		'̣',
		's',
		'ş',
		'Ş',
		'c',
		'ç',
		'Ç',
		'g',
		'ğ',
		'o',
		'ö',
		'u',
		'ü',
		'a',
		'A',
		' ',
		'\t',
		' ',
		'　',
		' ',
		'ﬁ',
		'Ａ',
		'ｉ',
		'ĳ',
		'ḭ',
		'ị',
		'İ',
		'K',
		'ß',
		'ẞ',
		'-',
		'.',
		'1',
	]

	test('normalizing a second time changes nothing, over a Turkish and NFKC heavy sample', () => {
		// The scope is stored once at ingest and recomputed by batch passes: the two must agree.
		for (let i = 0; i < 50_000; i += 1) {
			let brand = ''
			for (let j = 0, length = 1 + Math.floor(Math.random() * 8); j < length; j += 1) {
				brand += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
			}
			const once = normalizeBrand(brand)
			const twice = normalizeBrand(once)
			if (once !== twice) throw new Error(`${JSON.stringify(brand)} normalized to ${JSON.stringify(once)} then ${JSON.stringify(twice)}`)
		}
	})

	test('folds a whole run of combining dots in one pass', () => {
		const dot = '̇'
		expect(normalizeBrand(`i${dot}${dot}`)).toBe('i')
		expect(normalizeBrand(`i${dot}${dot}${dot}`)).toBe('i')
		expect(normalizeBrand(`İ${dot}lik`)).toBe('ilik')
		expect(normalizeBrand(`ı${dot}${dot}`)).toBe('i')
	})

	test('recomposes what folding the dotless i creates', () => {
		expect(normalizeBrand('ı̈')).toBe('ï')
		expect(normalizeBrand(normalizeBrand('ı̈'))).toBe('ï')
	})
})

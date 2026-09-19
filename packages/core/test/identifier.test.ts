import { describe, expect, test } from 'bun:test'

import { normalizeBrand, normalizeIdentifier } from '../src/identifier'

describe('normalizeBrand', () => {
	test('applies NFKC, case folding and whitespace collapsing', () => {
		expect(normalizeBrand('  Acme   Tekstil\t')).toBe('acme tekstil')
		expect(normalizeBrand('ＡＣＭＥ')).toBe('acme')
		expect(normalizeBrand(`Acme${String.fromCharCode(0xa0)}Tekstil`)).toBe('acme tekstil')
		expect(normalizeBrand('ACME')).toBe(normalizeBrand('acme'))
	})
})

describe('normalizeIdentifier', () => {
	const scope = { brand: 'Acme Tekstil', sourceScope: '01JQZ9' }

	test('normalizes a gtin to 14 digits in the global scope', () => {
		expect(normalizeIdentifier({ scheme: 'gtin', value: '9506000134420' }, scope)).toEqual({
			scheme: 'gtin',
			scope: '',
			value: '09506000134420',
		})
	})

	test('rejects a gtin that does not check out', () => {
		expect(normalizeIdentifier({ scheme: 'gtin', value: '9506000134421' }, scope)).toBeNull()
		expect(normalizeIdentifier({ scheme: 'gtin', value: '95060001344' }, scope)).toBeNull()
	})

	test('scopes an mpn to the normalized brand', () => {
		expect(normalizeIdentifier({ scheme: 'mpn', value: ' TJ-2041 ' }, scope)).toEqual({
			scheme: 'mpn',
			scope: 'acme tekstil',
			value: 'TJ-2041',
		})
		expect(normalizeIdentifier({ scheme: 'mpn', value: 'TJ-2041' }, {})).toEqual({ scheme: 'mpn', scope: '', value: 'TJ-2041' })
	})

	test('scopes a sku to the source id and leaves that id alone', () => {
		expect(normalizeIdentifier({ scheme: 'sku', value: 'ACME-TJ2041' }, scope)).toEqual({
			scheme: 'sku',
			scope: '01JQZ9',
			value: 'ACME-TJ2041',
		})
		expect(normalizeIdentifier({ scheme: 'sku', value: 'x' }, { sourceScope: 'Acme.Example' })?.scope).toBe('Acme.Example')
		expect(normalizeIdentifier({ scheme: 'sku', value: 'x' }, {})?.scope).toBe('')
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

	test('rejects an empty scheme or value', () => {
		expect(normalizeIdentifier({ scheme: '', value: 'x' }, scope)).toBeNull()
		expect(normalizeIdentifier({ scheme: 'sku', value: '   ' }, scope)).toBeNull()
	})
})

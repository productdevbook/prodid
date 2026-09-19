import { describe, expect, test } from 'bun:test'

import { canonicalHash, canonicalize } from '../src/canonical'

describe('canonicalize', () => {
	test('orders keys by UTF-16 code unit, not by code point', () => {
		// U+1F600 is the higher code point but starts with the lower surrogate code unit, so it sorts first.
		const emoji = String.fromCodePoint(0x1f600)
		const replacement = String.fromCharCode(0xfffd)
		expect(canonicalize({ [replacement]: 5, [emoji]: 4, á: 3, a: 2, A: 1 })).toBe(`{"A":1,"a":2,"á":3,"${emoji}":4,"${replacement}":5}`)
	})

	test('orders nested keys too and keeps array order', () => {
		expect(canonicalize({ b: [3, 1, 2], a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":[3,1,2]}')
	})

	test('serializes numbers the way RFC 8785 requires', () => {
		expect(canonicalize([Number('333333333.33333329'), 1e30, 4.5, 2e-3, 1e-27])).toBe('[333333333.3333333,1e+30,4.5,0.002,1e-27]')
		expect(canonicalize(-0)).toBe('0')
		expect(canonicalize(0)).toBe('0')
	})

	test('refuses numbers JSON cannot carry', () => {
		expect(() => canonicalize(Number.NaN)).toThrow(TypeError)
		expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(TypeError)
	})

	test('escapes only what JSON must escape', () => {
		expect(canonicalize('\u001f')).toBe('"\\u001f"')
		expect(canonicalize('\n\t"\\')).toBe('"\\n\\t\\"\\\\"')
		expect(canonicalize('€ 😀')).toBe('"€ 😀"')
	})

	test('refuses values that are not plain JSON', () => {
		expect(() => canonicalize(new Date(0))).toThrow(TypeError)
		expect(() => canonicalize(undefined)).toThrow(TypeError)
		expect(() => canonicalize(() => 1)).toThrow(TypeError)
	})

	test('drops undefined members, as JSON does', () => {
		expect(canonicalize({ a: 1, b: undefined, c: 2 })).toBe('{"a":1,"c":2}')
	})
})

describe('canonicalHash', () => {
	const record = {
		$type: 'org.prodid.item',
		key: 'TB-100',
		brand: 'Acme',
		name: 'Trail Bottle 1L',
		identifiers: [{ scheme: 'gtin', value: '9506000134420' }],
	}

	test('is stable under key reordering', async () => {
		const reordered = {
			identifiers: [{ value: '9506000134420', scheme: 'gtin' }],
			name: 'Trail Bottle 1L',
			brand: 'Acme',
			key: 'TB-100',
			$type: 'org.prodid.item',
		}
		expect(await canonicalHash(reordered)).toBe(await canonicalHash(record))
	})

	test('changes when a value changes', async () => {
		expect(await canonicalHash({ ...record, name: 'Trail Bottle 2L' })).not.toBe(await canonicalHash(record))
	})

	test('is 64 lowercase hex characters of SHA-256', async () => {
		expect(await canonicalHash({})).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a')
	})
})

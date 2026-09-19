import { describe, expect, test } from 'bun:test'

import { gtinCheckDigit, isGtin, parseGtin } from '../src/gtin'

describe('parseGtin', () => {
	test('accepts every GTIN length and normalizes to 14 digits', () => {
		expect(parseGtin('12345670')).toEqual({ ok: true, value: '00000012345670' })
		expect(parseGtin('036000291452')).toEqual({ ok: true, value: '00036000291452' })
		expect(parseGtin('4006381333931')).toEqual({ ok: true, value: '04006381333931' })
		expect(parseGtin('09506000134352')).toEqual({ ok: true, value: '09506000134352' })
	})

	test('rejects a wrong check digit', () => {
		expect(parseGtin('09506000134353')).toEqual({ ok: false, problem: 'check-digit' })
		expect(parseGtin('4006381333932')).toEqual({ ok: false, problem: 'check-digit' })
		expect(parseGtin('12345671')).toEqual({ ok: false, problem: 'check-digit' })
	})

	test('rejects lengths that are not 8, 12, 13 or 14', () => {
		for (const value of ['', '1234567', '123456701', '12345678901', '950600013442012', '0123456789']) {
			expect(parseGtin(value)).toEqual({ ok: false, problem: 'format' })
		}
	})

	test('rejects anything that is not digits', () => {
		for (const value of ['09506000 134352', '0950600013435X', '+9506000134352', '9.506000134420']) {
			expect(parseGtin(value)).toEqual({ ok: false, problem: 'format' })
		}
	})

	test('trims surrounding whitespace', () => {
		expect(parseGtin('  09506000134352\n')).toEqual({ ok: true, value: '09506000134352' })
	})

	test('a GTIN-8 keeps its check digit once padded to 14', () => {
		expect(isGtin('95060002')).toBe(true)
		expect(isGtin('00000095060002')).toBe(true)
	})
})

describe('gtinCheckDigit', () => {
	test('matches the published GS1 example', () => {
		expect(gtinCheckDigit('0950600013435')).toBe(2)
	})

	test('pads short bodies on the left', () => {
		expect(gtinCheckDigit('1234567')).toBe(gtinCheckDigit('0000001234567'))
	})

	test('refuses a body that is not at most 13 digits', () => {
		expect(() => gtinCheckDigit('09506000134352')).toThrow(RangeError)
		expect(() => gtinCheckDigit('12345x7')).toThrow(RangeError)
	})
})

import { describe, expect, test } from 'bun:test'

import { gtinCheckDigit, isGtin, isRestrictedGtin, parseGtin } from '../src/gtin'

const VECTORS = new URL('../../../spec/fixtures/gtin/', import.meta.url)

interface GtinVector {
	name: string
	value: string
	verdict: 'gtin' | 'rcn' | 'invalid'
}

async function vectors(): Promise<GtinVector[]> {
	const rows: GtinVector[] = []
	for await (const name of new Bun.Glob('*.json').scan({ cwd: VECTORS.pathname })) {
		rows.push({ name, ...((await Bun.file(new URL(name, VECTORS)).json()) as Omit<GtinVector, 'name'>) })
	}
	return rows.sort((a, b) => a.name.localeCompare(b.name))
}

describe('parseGtin', () => {
	test('accepts every GTIN length and normalizes to 14 digits', () => {
		expect(parseGtin('12345670')).toEqual({ ok: true, value: '00000012345670', restricted: false })
		expect(parseGtin('036000291452')).toEqual({ ok: true, value: '00036000291452', restricted: false })
		expect(parseGtin('4006381333931')).toEqual({ ok: true, value: '04006381333931', restricted: false })
		expect(parseGtin('09506000134352')).toEqual({ ok: true, value: '09506000134352', restricted: false })
	})

	test('rejects a wrong check digit', () => {
		expect(parseGtin('09506000134353')).toEqual({ ok: false, problem: 'check-digit' })
		expect(parseGtin('4006381333932')).toEqual({ ok: false, problem: 'check-digit' })
		expect(parseGtin('12345671')).toEqual({ ok: false, problem: 'check-digit' })
	})

	test('rejects the all-zero placeholder at every length, though its check digit is valid', () => {
		for (const length of [8, 12, 13, 14]) {
			const zeros = '0'.repeat(length)
			expect(gtinCheckDigit(zeros.slice(0, -1))).toBe(0)
			expect(parseGtin(zeros)).toEqual({ ok: false, problem: 'all-zero' })
		}
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
		expect(parseGtin('  09506000134352\n')).toEqual({ ok: true, value: '09506000134352', restricted: false })
	})

	test('a GTIN-8 keeps its check digit once padded to 14', () => {
		expect(isGtin('95060002')).toBe(true)
		expect(isGtin('00000095060002')).toBe(true)
	})
})

describe('restricted circulation numbers', () => {
	test('flags a number that means something only inside one company or region', () => {
		expect(parseGtin('2001234567893')).toEqual({ ok: true, value: '02001234567893', restricted: true })
		expect(parseGtin('0201234567899').ok && parseGtin('0201234567899')).toMatchObject({ restricted: true })
		expect(parseGtin('01234565')).toMatchObject({ restricted: true })
	})

	test('leaves an ordinary GTIN alone, including the reserved 05 prefix', () => {
		expect(parseGtin('0501234567890')).toMatchObject({ restricted: false })
		expect(parseGtin('1901234567897')).toMatchObject({ restricted: false })
		expect(parseGtin('3001234567892')).toMatchObject({ restricted: false })
	})

	test('reads the same verdict whatever length the number was written at', () => {
		expect(isRestrictedGtin('00000001234565')).toBe(true)
		expect(isRestrictedGtin(parseGtin('01234565').ok ? '00000001234565' : '')).toBe(true)
		expect(isRestrictedGtin('00000095060002')).toBe(false)
	})

	test('agrees with every vector the spec ships', async () => {
		const rows = await vectors()
		expect(rows.length).toBeGreaterThan(0)
		for (const { name, value, verdict } of rows) {
			const result = parseGtin(value)
			const got = !result.ok ? 'invalid' : result.restricted ? 'rcn' : 'gtin'
			if (got !== verdict) throw new Error(`fixtures/gtin/${name}: expected ${verdict}, got ${got} ${JSON.stringify(result)}`)
		}
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

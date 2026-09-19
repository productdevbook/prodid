import { describe, expect, test } from 'bun:test'

import { encodeOpid, isOpid, mintOpid, OPID_PATTERN } from '../src/opid'

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const MINTS = 10_000

describe('mintOpid', () => {
	test('every mint matches the opid pattern', () => {
		for (let i = 0; i < MINTS; i += 1) {
			const opid = mintOpid()
			if (!OPID_PATTERN.test(opid)) throw new Error(`not an opid: ${opid}`)
		}
	})

	test('mints are distinct', () => {
		const seen = new Set<string>()
		for (let i = 0; i < MINTS; i += 1) seen.add(mintOpid())
		expect(seen.size).toBe(MINTS)
	})

	test('every character is equally likely at every position', () => {
		const counts = Array.from({ length: 16 }, () => new Map<string, number>())
		for (let i = 0; i < MINTS; i += 1) {
			const opid = mintOpid()
			for (let position = 0; position < 16; position += 1) {
				const at = counts[position]!
				const character = opid[position]!
				at.set(character, (at.get(character) ?? 0) + 1)
			}
		}
		// Expected MINTS / 32 per character; the bound is six standard deviations wide.
		const expected = MINTS / ALPHABET.length
		const tolerance = 6 * Math.sqrt(MINTS * (1 / 32) * (31 / 32))
		for (const at of counts) {
			expect(at.size).toBe(ALPHABET.length)
			for (const [character, count] of at) {
				if (Math.abs(count - expected) > tolerance) throw new Error(`character ${character} appeared ${count} times, expected ~${expected}`)
			}
		}
	})
})

describe('encodeOpid', () => {
	test('maps the whole 80-bit range onto the alphabet', () => {
		expect(encodeOpid(new Uint8Array(10))).toBe('0'.repeat(16))
		expect(encodeOpid(new Uint8Array(10).fill(0xff))).toBe('z'.repeat(16))
	})

	test('needs exactly ten bytes', () => {
		expect(() => encodeOpid(new Uint8Array(9))).toThrow(RangeError)
		expect(() => encodeOpid(new Uint8Array(11))).toThrow(RangeError)
	})
})

describe('isOpid', () => {
	test('rejects the letters Crockford base32 leaves out', () => {
		for (const letter of ['i', 'l', 'o', 'u']) {
			expect(isOpid(`${letter}${'0'.repeat(15)}`)).toBe(false)
		}
	})

	test('rejects uppercase and the wrong length', () => {
		expect(isOpid('0'.repeat(15))).toBe(false)
		expect(isOpid('0'.repeat(17))).toBe(false)
		expect(isOpid('A'.repeat(16))).toBe(false)
		expect(isOpid('0'.repeat(16))).toBe(true)
	})
})

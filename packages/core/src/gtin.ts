const DIGITS = /^[0-9]+$/
const ACCEPTED_LENGTHS = new Set([8, 12, 13, 14])

/**
 * A GTIN-8 in the restricted range, read off the GTIN-14 form. Six leading zeros means the number
 * fits in eight digits, so it is a GTIN-8 whatever length it was written at, and its first digit
 * sits at index 6. GS1-8 prefixes `000`–`099` and `200`–`299` are restricted.
 */
const RESTRICTED_GTIN8 = /^000000[02]/

export type GtinProblem = 'format' | 'check-digit' | 'all-zero'

export type GtinResult =
	| {
			ok: true
			value: string
			/** A restricted-circulation number: valid, but it identifies nothing outside its issuer. */
			restricted: boolean
	  }
	| { ok: false; problem: GtinProblem }

/** GS1 mod-10 check digit for a body of at most 13 digits, right-aligned within GTIN-14. */
export function gtinCheckDigit(body: string): number {
	if (!DIGITS.test(body) || body.length > 13) throw new RangeError(`not a GTIN body: ${body}`)
	const padded = body.padStart(13, '0')
	let sum = 0
	for (let i = 0; i < 13; i += 1) {
		sum += Number(padded[i]) * (i % 2 === 0 ? 3 : 1)
	}
	return (10 - (sum % 10)) % 10
}

/** Validates a GTIN-8, -12, -13 or -14 and normalizes it to 14 digits. */
export function parseGtin(input: string): GtinResult {
	const value = input.trim()
	if (!DIGITS.test(value) || !ACCEPTED_LENGTHS.has(value.length)) return { ok: false, problem: 'format' }
	// All zeros carries a valid check digit and identifies nothing.
	if (!/[1-9]/.test(value)) return { ok: false, problem: 'all-zero' }
	const padded = value.padStart(14, '0')
	if (gtinCheckDigit(padded.slice(0, 13)) !== Number(padded[13])) return { ok: false, problem: 'check-digit' }
	return { ok: true, value: padded, restricted: isRestrictedGtin(padded) }
}

export function isGtin(input: string): boolean {
	return parseGtin(input).ok
}

/**
 * Whether a normalized GTIN-14 is a GS1 restricted-circulation number: it means something only
 * inside one company or one region, so it is never a global identifier. Read as 13 digits, which is
 * the GTIN-14 without its indicator, it is restricted when it begins `02`, `04`, `20`–`29` or
 * `0000000`; `05` is reserved rather than restricted and stays an ordinary GTIN.
 */
export function isRestrictedGtin(value: string): boolean {
	if (RESTRICTED_GTIN8.test(value)) return true
	const thirteen = value.slice(1)
	const prefix = thirteen.slice(0, 2)
	return prefix === '02' || prefix === '04' || prefix.startsWith('2') || thirteen.startsWith('0000000')
}

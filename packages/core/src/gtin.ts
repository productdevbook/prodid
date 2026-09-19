const DIGITS = /^[0-9]+$/
const ACCEPTED_LENGTHS = new Set([8, 12, 13, 14])

export type GtinProblem = 'format' | 'check-digit'

export type GtinResult = { ok: true; value: string } | { ok: false; problem: GtinProblem }

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
	const padded = value.padStart(14, '0')
	if (gtinCheckDigit(padded.slice(0, 13)) !== Number(padded[13])) return { ok: false, problem: 'check-digit' }
	return { ok: true, value: padded }
}

export function isGtin(input: string): boolean {
	return parseGtin(input).ok
}

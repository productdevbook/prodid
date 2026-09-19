const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const LENGTH = 16
const BITS_PER_CHAR = 5

export const OPID_PATTERN = /^[0-9a-hjkmnp-tv-z]{16}$/

/**
 * 16 Crockford base32 characters, 80 bits. The alphabet is a power of two, so every character
 * consumes exactly five random bits and no value is ever rejected or folded.
 */
export function mintOpid(): string {
	const bytes = new Uint8Array((LENGTH * BITS_PER_CHAR) / 8)
	crypto.getRandomValues(bytes)
	return encodeOpid(bytes)
}

export function encodeOpid(bytes: Uint8Array): string {
	if (bytes.length !== (LENGTH * BITS_PER_CHAR) / 8) throw new RangeError(`opid needs ${(LENGTH * BITS_PER_CHAR) / 8} bytes`)
	let out = ''
	let acc = 0
	let bits = 0
	for (const byte of bytes) {
		acc = (acc << 8) | byte
		bits += 8
		while (bits >= BITS_PER_CHAR) {
			bits -= BITS_PER_CHAR
			out += ALPHABET[(acc >>> bits) & 31]!
		}
	}
	return out
}

export function isOpid(value: string): boolean {
	return OPID_PATTERN.test(value)
}

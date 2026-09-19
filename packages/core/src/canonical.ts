export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const HEX = Array.from({ length: 256 }, (_unused, byte) => byte.toString(16).padStart(2, '0'))

/** RFC 8785 JSON Canonicalization Scheme. */
export function canonicalize(value: unknown): string {
	const out: string[] = []
	write(value, out)
	return out.join('')
}

/** SHA-256 of the canonical JSON, lowercase hex. This is the record hash. */
export async function canonicalHash(value: unknown): Promise<string> {
	return sha256Hex(canonicalize(value))
}

/** Lowercase hex SHA-256 of a string's UTF-8 bytes. */
export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	let out = ''
	for (const byte of new Uint8Array(digest)) out += HEX[byte]!
	return out
}

/**
 * Canonical JSON is the gate every value passes through on its way to the database, so it refuses
 * what cannot be kept: RFC 8785 §3.2.2.2 makes a lone surrogate an error, and `jsonb` refuses both
 * that and U+0000. Index-derived claims reach the database through here and nowhere else.
 */
function checkStorable(text: string, what: string): void {
	if (!text.isWellFormed()) throw new TypeError(`cannot canonicalize ${what} that is not well-formed`)
	if (text.includes('\u0000')) throw new TypeError(`cannot canonicalize ${what} containing U+0000`)
}

function write(value: unknown, out: string[]): void {
	if (value === null) {
		out.push('null')
		return
	}
	switch (typeof value) {
		case 'boolean':
			out.push(value ? 'true' : 'false')
			return
		case 'number':
			if (!Number.isFinite(value)) throw new TypeError(`cannot canonicalize ${value}`)
			// JSON.stringify uses the ECMAScript number-to-string algorithm RFC 8785 mandates, and prints -0 as 0.
			out.push(JSON.stringify(value))
			return
		case 'string':
			checkStorable(value, 'a string')
			out.push(JSON.stringify(value))
			return
		case 'object':
			break
		default:
			throw new TypeError(`cannot canonicalize ${typeof value}`)
	}
	if (Array.isArray(value)) {
		out.push('[')
		for (let i = 0; i < value.length; i += 1) {
			if (i > 0) out.push(',')
			write(value[i], out)
		}
		out.push(']')
		return
	}
	const prototype = Object.getPrototypeOf(value)
	if (prototype !== Object.prototype && prototype !== null) throw new TypeError('cannot canonicalize a non-plain object')
	const record = value as Record<string, unknown>
	const keys = Object.keys(record).sort()
	out.push('{')
	let first = true
	for (const key of keys) {
		const member = record[key]
		if (member === undefined) continue
		checkStorable(key, 'a key')
		if (!first) out.push(',')
		first = false
		out.push(JSON.stringify(key), ':')
		write(member, out)
	}
	out.push('}')
}

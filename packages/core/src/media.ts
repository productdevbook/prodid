export type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif' | 'application/pdf'

export interface SniffedType {
	type: MediaType
	kind: 'image' | 'document'
	/** How many leading bytes decided it, so a caller knows what it had to read. */
	bytes: number
}

/**
 * Enough leading bytes to decide every type below. The fixed patterns need at most 14; the rest of
 * the window is for an AVIF `ftyp` box, whose brand list a conforming file keeps well inside it.
 */
export const SNIFF_BYTES = 64

interface Signature {
	type: MediaType
	kind: 'image' | 'document'
	pattern: Uint8Array
	mask: Uint8Array
}

/**
 * The byte patterns of the MIME Sniffing Standard, §6.1 and §6.2, copied with their masks: a mask
 * byte of 0x00 marks a byte the pattern does not care about. Every one is anchored at offset zero —
 * no leading bytes are skipped — so an HTML page carrying `%PDF-` or a GIF header somewhere inside
 * it is not a PDF or a GIF.
 */
const SIGNATURES: Signature[] = [
	signature('image/gif', 'image', [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
	signature('image/gif', 'image', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
	signature('image/png', 'image', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	signature('image/jpeg', 'image', [0xff, 0xd8, 0xff]),
	signature(
		'image/webp',
		'image',
		[0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
		[0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
	),
	signature('application/pdf', 'document', [0x25, 0x50, 0x44, 0x46, 0x2d]),
]

const FTYP = [0x66, 0x74, 0x79, 0x70]
const AVIF_BRANDS = [
	[0x61, 0x76, 0x69, 0x66],
	[0x61, 0x76, 0x69, 0x73],
]

/**
 * The media type of a file, from its leading bytes alone, for exactly the six types the index
 * ingests. Everything else — SVG, HTML, archives, executables, office documents — is null.
 *
 * Sniffing cannot tell a file apart from a file of the same type with something appended: every one
 * of these formats tolerates trailing bytes. What keeps a polyglot harmless is serving it under the
 * sniffed type with `X-Content-Type-Options: nosniff`, not refusing to name it.
 */
export function sniffMedia(bytes: Uint8Array): SniffedType | null {
	for (const { type, kind, pattern, mask } of SIGNATURES) {
		if (matches(bytes, pattern, mask)) return { type, kind, bytes: pattern.length }
	}
	const avif = sniffAvif(bytes)
	return avif === null ? null : { type: 'image/avif', kind: 'image', bytes: avif }
}

/** The media licences the index may redistribute under, exactly as the spec lists them. */
export const INGESTIBLE_LICENCES: readonly string[] = [
	'CC0-1.0',
	'CC-BY-4.0',
	'CC-BY-SA-4.0',
	'CC-BY-ND-4.0',
	'CC-BY-3.0',
	'CC-BY-SA-3.0',
	'CC-BY-ND-3.0',
]

const INGESTIBLE = new Set(INGESTIBLE_LICENCES)

/** Whether media under this SPDX identifier may be stored and served on. Checked before any fetch. */
export function isIngestibleLicence(spdx: string): boolean {
	return INGESTIBLE.has(spdx)
}

/**
 * An ISO base media file whose `ftyp` box names AVIF, as the AV1 Image File Format defines it:
 * brand `avif` for a still image or `avis` for a sequence, as the major brand or among the
 * compatible ones. The box layout and the size checks follow the MP4 signature of the MIME Sniffing
 * Standard: size at 0, `ftyp` at 4, major brand at 8, compatible brands from 16 in steps of four.
 */
function sniffAvif(bytes: Uint8Array): number | null {
	if (bytes.length < 12) return null
	const size = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!
	if (size < 16 || size % 4 !== 0) return null
	if (!equals(bytes, 4, FTYP)) return null
	if (isAvifBrand(bytes, 8)) return 12
	const limit = Math.min(size >>> 0, bytes.length)
	for (let at = 16; at + 4 <= limit; at += 4) {
		if (isAvifBrand(bytes, at)) return at + 4
	}
	return null
}

function isAvifBrand(bytes: Uint8Array, at: number): boolean {
	return AVIF_BRANDS.some((brand) => equals(bytes, at, brand))
}

function equals(bytes: Uint8Array, at: number, expected: number[]): boolean {
	if (at + expected.length > bytes.length) return false
	return expected.every((byte, index) => bytes[at + index] === byte)
}

function matches(bytes: Uint8Array, pattern: Uint8Array, mask: Uint8Array): boolean {
	if (bytes.length < pattern.length) return false
	for (let i = 0; i < pattern.length; i += 1) {
		if ((bytes[i]! & mask[i]!) !== pattern[i]) return false
	}
	return true
}

function signature(type: MediaType, kind: 'image' | 'document', pattern: number[], mask?: number[]): Signature {
	return {
		type,
		kind,
		pattern: Uint8Array.from(pattern),
		mask: Uint8Array.from(mask ?? pattern.map(() => 0xff)),
	}
}

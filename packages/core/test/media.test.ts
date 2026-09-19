import { describe, expect, test } from 'bun:test'

import { INGESTIBLE_LICENCES, isIngestibleLicence, SNIFF_BYTES, sniffMedia } from '../src/media'

const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0))

function file(...parts: (number[] | string)[]): Uint8Array {
	return Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? ascii(part) : part)))
}

/** An ISO base media `ftyp` box: size, `ftyp`, major brand, minor version, then compatible brands. */
function ftyp(major: string, compatible: string[]): Uint8Array {
	const size = 16 + compatible.length * 4
	return file([(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff], 'ftyp', major, [0, 0, 0, 0], ...compatible)
}

const JPEG = file([0xff, 0xd8, 0xff, 0xe0], 'JFIF')
const PNG = file([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0x0d], 'IHDR')
const APNG = file([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0x08], 'acTL')
const GIF87 = file('GIF87a', [0x01, 0x00, 0x01, 0x00])
const GIF89 = file('GIF89a', [0x01, 0x00, 0x01, 0x00])
const WEBP = file('RIFF', [0x1a, 0x00, 0x00, 0x00], 'WEBP', 'VP8L')
const WEBP_LOSSY = file('RIFF', [0x2c, 0x00, 0x00, 0x00], 'WEBP', 'VP8 ')
const WEBP_EXTENDED = file('RIFF', [0x30, 0x00, 0x00, 0x00], 'WEBP', 'VP8X')
const PDF = file('%PDF-1.7\n%âãÏÓ\n')
const AVIF = ftyp('avif', ['mif1', 'miaf', 'MA1B'])
const AVIS = ftyp('avis', ['msf1', 'miaf', 'MA1B'])
const AVIF_COMPATIBLE = ftyp('mif1', ['miaf', 'avif', 'MA1B'])

describe('sniffMedia', () => {
	test('names every type the index ingests', () => {
		expect(sniffMedia(JPEG)).toEqual({ type: 'image/jpeg', kind: 'image', bytes: 3 })
		expect(sniffMedia(PNG)).toEqual({ type: 'image/png', kind: 'image', bytes: 8 })
		expect(sniffMedia(GIF87)).toEqual({ type: 'image/gif', kind: 'image', bytes: 6 })
		expect(sniffMedia(GIF89)).toEqual({ type: 'image/gif', kind: 'image', bytes: 6 })
		expect(sniffMedia(WEBP)).toEqual({ type: 'image/webp', kind: 'image', bytes: 14 })
		expect(sniffMedia(PDF)).toEqual({ type: 'application/pdf', kind: 'document', bytes: 5 })
	})

	test('an APNG is a PNG, as the spec says it is', () => {
		expect(sniffMedia(APNG)).toEqual({ type: 'image/png', kind: 'image', bytes: 8 })
	})

	test('reads every WebP chunk variant', () => {
		for (const bytes of [WEBP, WEBP_LOSSY, WEBP_EXTENDED]) {
			expect(sniffMedia(bytes)?.type).toBe('image/webp')
		}
	})

	test('reads AVIF from the major brand and from the compatible brands', () => {
		expect(sniffMedia(AVIF)).toEqual({ type: 'image/avif', kind: 'image', bytes: 12 })
		expect(sniffMedia(AVIS)).toEqual({ type: 'image/avif', kind: 'image', bytes: 12 })
		expect(sniffMedia(AVIF_COMPATIBLE)).toEqual({ type: 'image/avif', kind: 'image', bytes: 24 })
	})

	test('refuses the ISO base media files that are not AVIF', () => {
		expect(sniffMedia(ftyp('heic', ['mif1', 'miaf']))).toBeNull()
		expect(sniffMedia(ftyp('heix', ['mif1']))).toBeNull()
		expect(sniffMedia(ftyp('mif1', ['miaf', 'MA1B']))).toBeNull()
		expect(sniffMedia(ftyp('isom', ['iso2', 'mp41']))).toBeNull()
		expect(sniffMedia(ftyp('qt  ', []))).toBeNull()
	})

	test('refuses an ftyp box whose size cannot be one', () => {
		const bad = ftyp('avif', ['mif1'])
		expect(sniffMedia(file([0, 0, 0, 13], 'ftyp', 'avif', [0, 0, 0, 0]))).toBeNull()
		expect(sniffMedia(file([0, 0, 0, 8], 'ftyp', 'avif', [0, 0, 0, 0]))).toBeNull()
		expect(sniffMedia(bad.subarray(0, 11))).toBeNull()
	})

	test('refuses SVG in every disguise', () => {
		expect(sniffMedia(file('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull()
		expect(sniffMedia(file('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
		expect(sniffMedia(file('﻿<?xml version="1.0"?><svg/>'.replaceAll('﻿', '')))).toBeNull()
		expect(sniffMedia(file([0xef, 0xbb, 0xbf], '<svg/>'))).toBeNull()
	})

	test('refuses HTML and XHTML, including one carrying a magic number further in', () => {
		expect(sniffMedia(file('<!doctype html><html><body>hi</body></html>'))).toBeNull()
		expect(sniffMedia(file('<html><!-- %PDF-1.7 --><body>hi</body></html>'))).toBeNull()
		expect(sniffMedia(file('<html><!-- GIF89a --></html>'))).toBeNull()
		expect(sniffMedia(file('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"/>'))).toBeNull()
		expect(sniffMedia(file('\n\n%PDF-1.7'))).toBeNull()
		expect(sniffMedia(file('   %PDF-1.7'))).toBeNull()
	})

	test('refuses archives, including the ZIP every office document is', () => {
		expect(sniffMedia(file([0x50, 0x4b, 0x03, 0x04], 'word/document.xml'))).toBeNull()
		expect(sniffMedia(file([0x50, 0x4b, 0x03, 0x04], '[Content_Types].xml'))).toBeNull()
		expect(sniffMedia(file([0x50, 0x4b, 0x05, 0x06]))).toBeNull()
		expect(sniffMedia(file([0x1f, 0x8b, 0x08]))).toBeNull()
		expect(sniffMedia(file('ustar', [0x00]))).toBeNull()
		expect(sniffMedia(file([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))).toBeNull()
		expect(sniffMedia(file([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]))).toBeNull()
	})

	test('refuses anything executable', () => {
		expect(sniffMedia(file([0x7f], 'ELF'))).toBeNull()
		expect(sniffMedia(file('MZ', [0x90, 0x00]))).toBeNull()
		expect(sniffMedia(file([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]))).toBeNull()
		expect(sniffMedia(file([0xca, 0xfe, 0xba, 0xbe]))).toBeNull()
		expect(sniffMedia(file('#!/bin/sh\nrm -rf /'))).toBeNull()
	})

	test('refuses the old office documents too', () => {
		expect(sniffMedia(file([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBeNull()
		expect(sniffMedia(file('{\\rtf1\\ansi'))).toBeNull()
	})

	test('refuses an empty or truncated file', () => {
		expect(sniffMedia(new Uint8Array(0))).toBeNull()
		expect(sniffMedia(file([0xff, 0xd8]))).toBeNull()
		expect(sniffMedia(file('%PDF'))).toBeNull()
		expect(sniffMedia(file('RIFF', [0, 0, 0, 0], 'WEBP'))).toBeNull()
		expect(sniffMedia(file('RIFF', [0, 0, 0, 0], 'WAVE', 'fmt '))).toBeNull()
	})

	test('cannot unsee a valid prefix, and says so honestly', () => {
		// Every one of these formats tolerates trailing bytes, so a file that starts as a GIF is a
		// GIF. Serving it as image/gif with nosniff is what makes the appended HTML inert.
		expect(sniffMedia(file('GIF89a', [0x01, 0x00, 0x01, 0x00], '<html><script>alert(1)</script>'))?.type).toBe('image/gif')
	})

	test('needs no more than SNIFF_BYTES to decide', () => {
		for (const bytes of [JPEG, PNG, GIF89, WEBP, PDF, AVIF, AVIS, AVIF_COMPATIBLE]) {
			const sniffed = sniffMedia(bytes.subarray(0, SNIFF_BYTES))
			expect(sniffed).not.toBeNull()
			expect(sniffed!.bytes).toBeLessThanOrEqual(SNIFF_BYTES)
		}
	})
})

describe('isIngestibleLicence', () => {
	const SPEC = new URL('../../../spec/', import.meta.url)

	test('accepts exactly the seven the spec lists', () => {
		expect([...INGESTIBLE_LICENCES]).toEqual([
			'CC0-1.0',
			'CC-BY-4.0',
			'CC-BY-SA-4.0',
			'CC-BY-ND-4.0',
			'CC-BY-3.0',
			'CC-BY-SA-3.0',
			'CC-BY-ND-3.0',
		])
		for (const licence of INGESTIBLE_LICENCES) expect(isIngestibleLicence(licence)).toBe(true)
	})

	test('refuses everything else, including the non-commercial and the misspelled', () => {
		for (const licence of ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY', 'cc0-1.0', 'CC0', 'MIT', 'All rights reserved', '', ' CC0-1.0']) {
			expect(isIngestibleLicence(licence)).toBe(false)
		}
	})

	test('is the same list the spec ships, read out of its own validator', async () => {
		const source = await Bun.file(new URL('validate.ts', SPEC)).text()
		const declared = source.match(/INGESTIBLE_LICENCES[^=]*=\s*\[([^\]]*)\]/)
		expect(declared).not.toBeNull()
		const listed = [...declared![1]!.matchAll(/'([^']+)'/g)].map((match) => match[1]!)
		expect(listed.length).toBeGreaterThan(0)
		expect(listed).toEqual([...INGESTIBLE_LICENCES])
	})

	test('accepts the licence the merchant fixture declares', async () => {
		const expected = (await Bun.file(new URL('fixtures/merchant/expected.json', SPEC)).json()) as Record<
			string,
			{ declared: { license: string } }
		>
		const licences = Object.values(expected).map((entry) => entry.declared.license)
		expect(licences.length).toBeGreaterThan(0)
		for (const licence of licences) expect(isIngestibleLicence(licence)).toBe(true)
	})
})

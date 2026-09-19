import { describe, expect, test } from 'bun:test'

import { type DelimitedEntry, type DelimitedOptions, readDelimited } from '../src/delimited'

const encoder = new TextEncoder()

function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
			controller.close()
		},
	})
}

async function rows(text: string | ReadableStream<Uint8Array>, options?: DelimitedOptions): Promise<DelimitedEntry[]> {
	const stream = typeof text === 'string' ? streamOf(text) : text
	const entries: DelimitedEntry[] = []
	for await (const entry of readDelimited(stream, options ?? {})) entries.push(entry)
	return entries
}

describe('readDelimited', () => {
	test('numbers rows the way a spreadsheet does, with the header as row 1', async () => {
		expect(await rows('a,b\n1,2\n3,4\n')).toEqual([
			{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } },
			{ row: 3, ok: true, values: { a: ['3'], b: ['4'] } },
		])
	})

	test('takes the delimiter from the header, and accepts one that is given', async () => {
		expect(await rows('a\tb\n1\t2\n')).toEqual([{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } }])
		expect(await rows('a\tb\n1\t2\n', { delimiter: 'tab' })).toEqual([{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } }])
		// A tab inside a comma-separated field is just text.
		expect(await rows('a,b\n1\t1,2\n', { delimiter: 'comma' })).toEqual([{ row: 2, ok: true, values: { a: ['1\t1'], b: ['2'] } }])
	})

	test('reads a quoted field holding the delimiter, a newline and doubled quotes', async () => {
		expect(await rows('a,b\n"x,y","line1\nline2"\n"he said ""hi""",z\n')).toEqual([
			{ row: 2, ok: true, values: { a: ['x,y'], b: ['line1\nline2'] } },
			{ row: 3, ok: true, values: { a: ['he said "hi"'], b: ['z'] } },
		])
	})

	test('a newline inside a quoted field does not advance the row number', async () => {
		expect(await rows('a\n"one\ntwo\nthree"\nlast\n')).toEqual([
			{ row: 2, ok: true, values: { a: ['one\ntwo\nthree'] } },
			{ row: 3, ok: true, values: { a: ['last'] } },
		])
	})

	test('accepts CRLF, a missing final newline and a byte order mark', async () => {
		expect(await rows('a,b\r\n1,2\r\n3,4')).toEqual([
			{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } },
			{ row: 3, ok: true, values: { a: ['3'], b: ['4'] } },
		])
		expect(await rows('﻿a,b\n1,2\n')).toEqual([{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } }])
		expect(await rows(streamOf(new Uint8Array([0xef, 0xbb, 0xbf]), 'a,b\n1,2\n'))).toEqual([
			{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } },
		])
	})

	test('survives a record split across chunks, byte by byte', async () => {
		const bytes = encoder.encode('a,b\n"x,\nÿ","ü✓😀"\n2,3\n')
		const stream = streamOf(...[...bytes].map((byte) => new Uint8Array([byte])))
		expect(await rows(stream)).toEqual([
			{ row: 2, ok: true, values: { a: ['x,\nÿ'], b: ['ü✓😀'] } },
			{ row: 3, ok: true, values: { a: ['2'], b: ['3'] } },
		])
	})

	test('splits a CRLF across chunks without losing the row', async () => {
		expect(await rows(streamOf('a,b\r', '\n1,2\r', '\n'))).toEqual([{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } }])
	})

	test('pads a short row and ignores a long one', async () => {
		expect(await rows('a,b,c\n1\n')).toEqual([{ row: 2, ok: true, values: { a: ['1'], b: [''], c: [''] } }])
		expect(await rows('a,b\n1,2,3\n')).toEqual([{ row: 2, ok: true, values: { a: ['1'], b: ['2'] } }])
	})

	test('keeps a header that appears twice as two values, losslessly', async () => {
		expect(await rows('a,a,b\n1,2,3\n')).toEqual([{ row: 2, ok: true, values: { a: ['1', '2'], b: ['3'] } }])
		expect(await rows('a,a\n,2\n')).toEqual([{ row: 2, ok: true, values: { a: ['', '2'] } }])
	})

	test('a repeated column keeps a value that contains the delimiter', async () => {
		// Joined with a comma these would be indistinguishable from one cell holding both.
		expect(await rows('a,a\n"x,y",z\n')).toEqual([{ row: 2, ok: true, values: { a: ['x,y', 'z'] } }])
	})

	test('skips a blank line but still counts its row', async () => {
		expect(await rows('a\n1\n\n3\n')).toEqual([
			{ row: 2, ok: true, values: { a: ['1'] } },
			{ row: 4, ok: true, values: { a: ['3'] } },
		])
	})

	test('reports a record that will not end instead of buffering the file', async () => {
		expect(await rows(`a,b\n"${'x'.repeat(200)}`, { maxRecordChars: 64 })).toEqual([
			{ row: 2, ok: false, error: 'record exceeds 64 characters' },
		])
	})

	test('handles an empty file and a header with no rows', async () => {
		expect(await rows('')).toEqual([])
		expect(await rows('a,b\n')).toEqual([])
	})
})

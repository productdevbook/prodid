import { describe, expect, test } from 'bun:test'

import { type NdjsonEntry, readNdjson } from '../src/ndjson'

const encoder = new TextEncoder()

function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
			controller.close()
		},
	})
}

function byteAtATime(text: string): ReadableStream<Uint8Array> {
	const bytes = encoder.encode(text)
	return streamOf(...[...bytes].map((byte) => new Uint8Array([byte])))
}

async function collect(stream: ReadableStream<Uint8Array>, maxLineBytes?: number): Promise<NdjsonEntry[]> {
	const entries: NdjsonEntry[] = []
	for await (const entry of readNdjson(stream, maxLineBytes === undefined ? {} : { maxLineBytes })) entries.push(entry)
	return entries
}

describe('readNdjson', () => {
	test('yields one entry per line with its line number', async () => {
		expect(await collect(streamOf('{"a":1}\n{"a":2}\n'))).toEqual([
			{ line: 1, ok: true, value: { a: 1 } },
			{ line: 2, ok: true, value: { a: 2 } },
		])
	})

	test('survives multi-byte characters split across chunks', async () => {
		const text = '{"a":"ü✓😀"}\n{"b":"ß"}\n'
		expect(await collect(byteAtATime(text))).toEqual([
			{ line: 1, ok: true, value: { a: 'ü✓😀' } },
			{ line: 2, ok: true, value: { b: 'ß' } },
		])
	})

	test('splits a chunk boundary in the middle of a token', async () => {
		expect(await collect(streamOf('{"a":', '1}\n{"b', '":2}\n'))).toEqual([
			{ line: 1, ok: true, value: { a: 1 } },
			{ line: 2, ok: true, value: { b: 2 } },
		])
	})

	test('accepts CRLF', async () => {
		expect(await collect(streamOf('{"a":1}\r\n{"a":2}\r\n'))).toEqual([
			{ line: 1, ok: true, value: { a: 1 } },
			{ line: 2, ok: true, value: { a: 2 } },
		])
	})

	test('skips blank lines but still counts them', async () => {
		expect(await collect(streamOf('\n{"a":1}\n   \n\r\n{"a":2}\n'))).toEqual([
			{ line: 2, ok: true, value: { a: 1 } },
			{ line: 5, ok: true, value: { a: 2 } },
		])
	})

	test('reads a last line with no trailing newline', async () => {
		expect(await collect(streamOf('{"a":1}\n{"a":2}'))).toEqual([
			{ line: 1, ok: true, value: { a: 1 } },
			{ line: 2, ok: true, value: { a: 2 } },
		])
	})

	test('strips the UTF-8 byte order mark', async () => {
		expect(await collect(streamOf('﻿{"a":1}\n'))).toEqual([{ line: 1, ok: true, value: { a: 1 } }])
	})

	test('reports a broken line and keeps going', async () => {
		const entries = await collect(streamOf('{"a":1}\n{"a":\n{"a":3}\n'))
		expect(entries[0]).toEqual({ line: 1, ok: true, value: { a: 1 } })
		expect(entries[1]?.ok).toBe(false)
		expect(entries[1]?.line).toBe(2)
		expect(entries[2]).toEqual({ line: 3, ok: true, value: { a: 3 } })
	})

	test('rejects a line over the maximum and resumes at the next one', async () => {
		const long = `{"a":"${'x'.repeat(200)}"}`
		const entries = await collect(streamOf(`"first"\n${long}\n{"a":3}\n`), 32)
		expect(entries).toEqual([
			{ line: 1, ok: true, value: 'first' },
			{ line: 2, ok: false, error: 'line exceeds 32 bytes' },
			{ line: 3, ok: true, value: { a: 3 } },
		])
	})

	test('reports an over-long line before the line has ended', async () => {
		const chunks = Array.from({ length: 10 }, () => 'x'.repeat(16))
		const entries: NdjsonEntry[] = []
		for await (const entry of readNdjson(streamOf(...chunks, '\n{"a":1}\n'), { maxLineBytes: 32 })) {
			entries.push(entry)
			if (entries.length === 1) break
		}
		expect(entries).toEqual([{ line: 1, ok: false, error: 'line exceeds 32 bytes' }])
	})

	test('handles an empty stream', async () => {
		expect(await collect(streamOf())).toEqual([])
		expect(await collect(streamOf('\n\n'))).toEqual([])
	})
})

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { build } from 'esbuild'

import type * as Record from '../src/record/index'

const SPEC = new URL('../../../spec/examples/', import.meta.url)
const dir = await mkdtemp(join(tmpdir(), 'prodid-core-bundle-'))

afterAll(() => rm(dir, { recursive: true, force: true }))

async function bundled(): Promise<typeof Record> {
	const outfile = join(dir, 'record.js')
	await build({
		entryPoints: [new URL('../src/record/index.ts', import.meta.url).pathname],
		bundle: true,
		format: 'esm',
		conditions: ['workerd', 'worker', 'browser'],
		outfile,
		logLevel: 'silent',
	})
	return (await import(outfile)) as typeof Record
}

const record = await bundled()

describe('the record validators bundled the way wrangler bundles a Worker', () => {
	test('validate an item, which runs the ucs2length and equal helpers', async () => {
		const result = record.validateItem(await Bun.file(new URL('item.jacket.json', SPEC)).json())
		expect(result.ok).toBe(true)
	})

	test('validate a feed', async () => {
		const result = record.validateFeed(await Bun.file(new URL('prodid.json', SPEC)).json())
		expect(result.ok).toBe(true)
	})

	test('reject a too-long brand through the length helper', async () => {
		const item = await Bun.file(new URL('item.jacket.json', SPEC)).json()
		const result = record.validateItem({ ...item, brand: 'x'.repeat(257) })
		expect(result.ok).toBe(false)
	})
})

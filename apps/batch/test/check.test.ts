import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

import { checkDocument, checkFeed, formatProblem, MAX_LINE_BYTES } from '../src/check'

const EXAMPLES = new URL('../../../spec/examples/', import.meta.url)
const NDJSON = new URL('../../../spec/fixtures/ndjson/', import.meta.url)
const CLI = new URL('../src/cli.ts', import.meta.url).pathname

function stream(text: string): ReadableStream<Uint8Array> {
	return new Blob([text]).stream()
}

const ITEM = {
	$type: 'org.prodid.item',
	key: 'TB-100',
	brand: 'Acme',
	name: 'Trail Bottle 1L',
	identifiers: [{ scheme: 'gtin', value: '9506000134420' }],
}

describe('checkFeed', () => {
	test('reports exactly the lines the fixture expects', async () => {
		const expected = (await Bun.file(new URL('expected.json', NDJSON)).json()) as Record<string, number[]>
		for (const [name, lines] of Object.entries(expected)) {
			const result = await checkFeed(Bun.file(new URL(name, NDJSON)).stream())
			expect([...new Set(result.problems.map((problem) => problem.line))]).toEqual(lines)
		}
	})

	test('skips a line over 64 KiB as the crawler does', async () => {
		const long = JSON.stringify({ ...ITEM, name: 'x'.repeat(MAX_LINE_BYTES) })
		const result = await checkFeed(stream(`${JSON.stringify(ITEM)}\n${long}\n${JSON.stringify({ ...ITEM, key: 'TB-101' })}\n`))
		expect(result.problems.map((problem) => problem.line)).toEqual([2])
		expect(result.records).toBe(2)
	})

	test('reads a discovery document on a feed line as a skipped line', async () => {
		const discovery = await Bun.file(new URL('prodid.json', EXAMPLES)).json()
		const result = await checkFeed(stream(`${JSON.stringify(discovery)}\n`))
		expect(new Set(result.problems.map((problem) => problem.line))).toEqual(new Set([1]))
		expect(result.records).toBe(0)
	})
})

describe('checkDocument', () => {
	test('passes every JSON example in the spec', async () => {
		for (const name of (await readdir(EXAMPLES)).filter((file) => file.endsWith('.json'))) {
			expect({ name, problems: checkDocument(await Bun.file(new URL(name, EXAMPLES)).text()).problems }).toEqual({ name, problems: [] })
		}
	})

	test('refuses a discovery document the index would refuse, with the field it fails on', async () => {
		const discovery = await Bun.file(new URL('prodid.json', EXAMPLES)).json()
		const result = checkDocument(JSON.stringify({ ...discovery, feeds: [] }))
		expect(result.problems.length).toBeGreaterThan(0)
		expect(result.problems.every((problem) => problem.line === null && problem.message.startsWith('/feeds'))).toBe(true)
	})

	test('names the types it knows when $type is none of them', () => {
		expect(checkDocument('{"$type":"org.prodid.other"}').problems).toEqual([
			{ line: null, message: '/$type must be one of org.prodid.feed, org.prodid.item, org.prodid.entity, org.prodid.source' },
		])
	})

	test('reports JSON that does not parse', () => {
		expect(checkDocument('{').problems).toHaveLength(1)
	})
})

describe('prodid-batch check', () => {
	async function run(...args: string[]): Promise<{ code: number; stdout: string }> {
		const env = { ...process.env }
		delete env.PRODID_OPERATOR_TOKEN
		const child = Bun.spawn(['bun', CLI, 'check', ...args], { env, stdout: 'pipe', stderr: 'pipe' })
		const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()])
		return { code, stdout }
	}

	test('passes every spec example without a token', async () => {
		const files = (await readdir(EXAMPLES)).map((name) => new URL(name, EXAMPLES).pathname)
		const result = await run(...files)
		expect(result.code).toBe(0)
		expect(result.stdout.trim().split('\n')).toHaveLength(files.length)
	})

	test('prints one line per problem with its line number and exits non-zero', async () => {
		const path = new URL('lines.ndjson', NDJSON).pathname
		const result = await run(path)
		expect(result.code).toBe(1)
		const lines = result.stdout.trim().split('\n')
		expect(lines.map((line) => Number(line.slice(path.length + 1).split(':')[0]))).toEqual([2, 3, 4, 5, 6, 8])
		expect(lines[0]).toBe(formatProblem(path, { line: 2, message: '/name value must not contain an unpaired surrogate' }))
	})
})

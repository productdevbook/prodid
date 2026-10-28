import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readSourceStatus, type Sql } from '@prodid/store'
import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

import { runImport, WIKIDATA_DUMP_URL } from '../src/dataset'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname
const FIXTURES = new URL('../../../spec/fixtures/datasets/wikidata/', import.meta.url)
const entities = (await Bun.file(new URL('entities.json', FIXTURES)).json()) as { id: string; type: string }[]
const expected = (await Bun.file(new URL('expected.json', FIXTURES)).json()) as Record<string, { ok: boolean; record?: unknown }>

const SKIPS = 'skipped: 11 (not-an-item 2, no-gtin 5, no-brand 3, no-label 1, invalid 0, unreadable 0)'
const MAPPED = Object.entries(expected)
	.filter(([, outcome]) => outcome.ok)
	.map(([id, outcome]) => [id, outcome.record] as const)
	.sort(([a], [b]) => a.localeCompare(b))

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

/** The fixture written as Wikidata writes its dumps: a JSON array with one entity per line. */
function dump(list: readonly unknown[]): string {
	return `[\n${list.map((entity) => JSON.stringify(entity)).join(',\n')}\n]\n`
}

const scratch: string[] = []
async function directory(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), 'prodid-import-test-'))
	scratch.push(path)
	return path
}

async function bzip2(text: string): Promise<Uint8Array> {
	const child = Bun.spawn(['bzip2', '-c'], { stdin: new TextEncoder().encode(text), stdout: 'pipe' })
	const bytes = new Uint8Array(await new Response(child.stdout).arrayBuffer())
	expect(await child.exited).toBe(0)
	return bytes
}

/** Two gzip members back to back, as Wikimedia's parallel dump writers concatenate them. */
function gzipMembers(text: string): Uint8Array {
	const cut = text.indexOf('\n', text.length >> 1) + 1
	const first = Bun.gzipSync(new TextEncoder().encode(text.slice(0, cut)))
	const second = Bun.gzipSync(new TextEncoder().encode(text.slice(cut)))
	const out = new Uint8Array(first.length + second.length)
	out.set(first)
	out.set(second, first.length)
	return out
}

async function live(sql: Sql): Promise<(readonly [string, unknown])[]> {
	const rows = await sql<{ key: string; body: unknown }[]>`
		select r.key, r.body from record r join source s on s.id = r.source
		where s.name = 'dataset:wikidata' and r.withdrawn_at is null and r.feed is null order by r.key
	`
	return rows.map((row) => [row.key, row.body] as const)
}

describe('import refuses before touching anything', () => {
	test('without DATABASE_URL', async () => {
		const run = await cli(['import', 'wikidata', '/nonexistent'], {})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('DATABASE_URL is not set')
		expect(run.stdout).toBe('')
	})

	test('a dataset it does not know, or no export', async () => {
		const unknown = await cli(['import', 'openfoodfacts', '/nonexistent'], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' })
		expect(unknown.code).toBe(1)
		expect(unknown.stderr).toContain('unknown dataset openfoodfacts; known: wikidata')
		const missing = await cli(['import', 'wikidata'], {})
		expect(missing.code).toBe(1)
		expect(missing.stderr).toContain('missing file|url')
	})

	test('a document URL that is not https', async () => {
		const run = await cli(['import', 'wikidata', '/nonexistent', '--document-url', 'http://example.org/dump.json.gz'], {
			DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x',
		})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain("the export's document URL must be a public https URL")
		expect(run.stdout).toBe('')
	})
})

const reachable = await databaseReachable()
const throwaways: Throwaway[] = []
let files: { plain: string; gzip: string; bzip2: string; fewer: string; truncated: string }

async function database(): Promise<Throwaway> {
	const created = await createDatabase()
	throwaways.push(created)
	return created
}

beforeAll(async () => {
	const dir = await directory()
	const reversed = dump([...entities].reverse())
	files = {
		plain: join(dir, 'latest-all.json'),
		gzip: join(dir, 'latest-all.json.gz'),
		bzip2: join(dir, 'latest-all.json.bz2'),
		fewer: join(dir, 'fewer.json.gz'),
		truncated: join(dir, 'truncated.json.gz'),
	}
	await Bun.write(files.plain, dump(entities))
	await Bun.write(files.gzip, gzipMembers(reversed))
	await Bun.write(files.bzip2, await bzip2(reversed))
	await Bun.write(files.fewer, Bun.gzipSync(new TextEncoder().encode(dump(entities.filter((entity) => entity.id !== 'Q1001')))))
	const whole = Bun.gzipSync(new TextEncoder().encode(dump(entities)))
	await Bun.write(files.truncated, whole.subarray(0, whole.length >> 1))
})

afterAll(async () => {
	for (const created of throwaways) await created.drop()
	for (const path of scratch) await rm(path, { recursive: true, force: true })
})

describe.skipIf(!reachable)('prodid-batch import wikidata', () => {
	test('streams a gzip dump whose brands come after their items, and prints what it did', async () => {
		const index = await database()
		const run = await cli(['import', 'wikidata', files.gzip], { DATABASE_URL: index.url })
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		const lines = run.stdout.trimEnd().split('\n')
		expect(lines).toEqual([
			`database: ${new URL(index.url).host}`,
			`dataset: wikidata, export ${files.gzip}`,
			`document_url: ${WIKIDATA_DUMP_URL}`,
			'pass 1: 14 entities, 7 with a GTIN, 4 brands named',
			'pass 2: 2 of 4 brands have an English label',
			'written: 3 records, 3 changed',
			SKIPS,
			'dropped: 3 values',
			'withdrawn: 0 records, 0 claims',
			expect.stringMatching(/^done in \d+\.\d s$/),
		])
		expect(await live(index.sql)).toEqual(MAPPED)

		const status = await readSourceStatus(index.sql, 'dataset:wikidata')
		expect(status).toMatchObject({
			kind: 'dataset',
			trust: 'unverified',
			license: 'CC0-1.0',
			last_crawl: { via: 'import', document_url: WIKIDATA_DUMP_URL, records_seen: 3, records_changed: 3, lines_skipped: 0 },
		})
		expect(status?.last_crawl).not.toHaveProperty('http_status')
	})

	test('plain and bzip2 dumps import the same records; a later full import withdraws what it no longer holds', async () => {
		const index = await database()
		const log: string[] = []
		const plain = await runImport(index.url, 'wikidata', files.plain, { log: (line) => log.push(line), progressEvery: 5 })
		expect(log.filter((line) => /^pass 1: \d+ entities$/.test(line))).toEqual(['pass 1: 5 entities', 'pass 1: 10 entities'])
		expect(plain).toMatchObject({ entities: 14, written: 3, changed: 3, dropped: 3, outcome: 'changed' })
		expect(await live(index.sql)).toEqual(MAPPED)

		const again = await runImport(index.url, 'wikidata', files.bzip2, { log: () => {} })
		expect(again).toMatchObject({ written: 3, changed: 0, withdrawn: { records: 0, claims: 0 }, outcome: 'unchanged' })
		expect(await live(index.sql)).toEqual(MAPPED)

		const fewer = await runImport(index.url, 'wikidata', files.fewer, { log: () => {} })
		expect(fewer.written).toBe(2)
		expect(fewer.withdrawn.records).toBe(1)
		expect(fewer.withdrawn.claims).toBeGreaterThan(0)
		expect(await live(index.sql)).toEqual(MAPPED.filter(([id]) => id !== 'Q1001'))
	})

	test('a dump that cannot be read to its end withdraws nothing and leaves no finished import', async () => {
		const index = await database()
		await runImport(index.url, 'wikidata', files.plain, { log: () => {} })
		const failure = await runImport(index.url, 'wikidata', files.truncated, { log: () => {} }).catch((error: unknown) => error)
		expect(failure).toBeInstanceOf(Error)
		expect((failure as Error).message).toStartWith('gzip -dc ')
		expect(await live(index.sql)).toEqual(MAPPED)
		const crawls = await index.sql<{ open: number }[]>`select count(*) filter (where finished_at is null)::int as open from crawl`
		expect(crawls[0]!.open).toBe(1)
	})

	test('a dump with no record in it is refused before it can withdraw everything', async () => {
		const index = await database()
		await runImport(index.url, 'wikidata', files.plain, { log: () => {} })
		const empty = join(await directory(), 'empty.json')
		await Bun.write(empty, dump(entities.filter((entity) => !expected[entity.id]!.ok)))
		await expect(runImport(index.url, 'wikidata', empty, { log: () => {} })).rejects.toThrow(/no entity became a record/)
		expect(await live(index.sql)).toEqual(MAPPED)
	})

	test('a dump at a URL is downloaded first, and its URL is the document URL', async () => {
		const server = Bun.serve({
			port: 0,
			fetch: (request) => {
				const path = new URL(request.url).pathname
				return path === '/latest-all.json.bz2' ? new Response(Bun.file(files.bzip2)) : new Response('not found', { status: 404 })
			},
		})
		try {
			const index = await database()
			const log: string[] = []
			const url = `${server.url.origin}/latest-all.json.bz2`
			const documentUrl = 'https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2'
			const result = await runImport(index.url, 'wikidata', url, { log: (line) => log.push(line), documentUrl })
			expect(result.written).toBe(3)
			expect(log).toContainEqual(expect.stringMatching(/^downloaded \d+ bytes to .*latest-all\.json\.bz2$/))
			expect((await readSourceStatus(index.sql, 'dataset:wikidata'))?.last_crawl?.document_url).toBe(documentUrl)

			await expect(
				runImport(index.url, 'wikidata', `${server.url.origin}/missing.json.gz`, { log: () => {}, documentUrl }),
			).rejects.toThrow(/answered 404/)
			await expect(runImport(index.url, 'wikidata', url, { log: () => {} })).rejects.toThrow(/must be a public https URL/)
		} finally {
			server.stop(true)
		}
	})
})

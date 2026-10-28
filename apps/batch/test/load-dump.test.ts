import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type DumpFile, type DumpManifest } from '@prodid/core'
import { readEntity, readSourceStatus, type Sql } from '@prodid/store'
import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

import { directoryTarget, runDump } from '../src/dump'
import { runLoadDump } from '../src/load'
import { ACME, CANARY, crawlFeed, feedLines, ITEMS, MERCHANT, populate } from './support'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname

const operator = (url: string) => ({ DATABASE_URL: url, PRODID_OPERATOR: 'test' })

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

describe('load-dump refuses before touching anything', () => {
	test('without DATABASE_URL or PRODID_OPERATOR', async () => {
		const unset = await cli(['load-dump', '/nonexistent'], { PRODID_OPERATOR: 'test' })
		expect(unset.code).toBe(1)
		expect(unset.stderr).toContain('DATABASE_URL is not set')
		const anonymous = await cli(['load-dump', '/nonexistent'], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' })
		expect(anonymous.code).toBe(1)
		expect(anonymous.stderr).toContain('PRODID_OPERATOR is not set')
		expect(anonymous.stdout).toBe('')
	})

	test('a manifest that is neither a v0 nor a v1 dump', async () => {
		for (const version of ['', 'v1/']) {
			const vectors = new URL(`../../../spec/fixtures/${version}dump/invalid/`, import.meta.url).pathname
			for (const name of await readdir(vectors)) {
				if (name === 'version-not-zero.json' || name === 'version-not-one.json') continue
				await expect(runLoadDump(operator('postgres://u:p@127.0.0.1:1/x'), join(vectors, name), { log: () => {} })).rejects.toThrow(
					/is not an org\.prodid\.dump manifest/,
				)
			}
		}
	})

	test('without a location', async () => {
		const run = await cli(['load-dump'], {})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('missing dir|url')
	})
})

const reachable = await databaseReachable()
const throwaways: Throwaway[] = []
const scratch: string[] = []
let indexA: Throwaway
let indexB: Throwaway
let out: string
let manifest: DumpManifest
let dated: string

const DAY = 86_400_000
const crawledAt = new Date(Date.now() - DAY)

async function database(): Promise<Throwaway> {
	const created = await createDatabase()
	throwaways.push(created)
	return created
}

async function directory(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), 'prodid-load-test-'))
	scratch.push(path)
	return path
}

async function opids(sql: Sql): Promise<string[]> {
	return (await sql<{ opid: string }[]>`select opid from entity order by opid`).map((row) => row.opid)
}

/** The dump at `from` as v0 wrote it: a v0 manifest, and source and entity lines without `version`. */
async function asV0(from: string, to: string): Promise<void> {
	const v1: DumpManifest = JSON.parse(await Bun.file(join(from, 'manifest.json')).text())
	const files: DumpFile[] = []
	for (const file of v1.files) {
		let bytes = new Uint8Array(await Bun.file(join(from, file.name)).arrayBuffer())
		if (file.name === 'sources.ndjson.gz' || file.name === 'entities.ndjson.gz') {
			const lines = new TextDecoder().decode(Bun.gunzipSync(bytes)).split('\n').slice(0, -1)
			const unversioned = lines.map((line) => {
				const { version: _, ...rest } = JSON.parse(line) as Record<string, unknown>
				return `${JSON.stringify(rest)}\n`
			})
			bytes = Bun.gzipSync(new TextEncoder().encode(unversioned.join('')))
		}
		await Bun.write(join(to, file.name), bytes)
		files.push({ ...file, sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'), bytes: bytes.length })
	}
	await Bun.write(join(to, 'manifest.json'), JSON.stringify({ ...v1, version: 0, files }))
}

async function entityCount(sql: Sql): Promise<number> {
	return (await sql<{ count: number }[]>`select count(*)::int as count from entity`)[0]!.count
}

beforeAll(async () => {
	if (!reachable) return
	indexA = await database()
	await populate(indexA.sql, crawledAt)
	out = await directory()
	manifest = (await runDump(indexA.url, directoryTarget(out), { log: () => {} })).manifest
	dated = join(out, 'v1', manifest.snapshot_at.slice(0, 10))
	indexB = await database()
})

afterAll(async () => {
	for (const created of throwaways) await created.drop()
	for (const path of scratch) await rm(path, { recursive: true, force: true })
})

describe.skipIf(!reachable)('the index is replaceable', () => {
	test('load-dump checks every file, then loads the dump into an empty index', async () => {
		const run = await cli(['load-dump', dated], operator(indexB.url))
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		const lines = run.stdout.trimEnd().split('\n')
		expect(lines[0]).toBe(`database: ${new URL(indexB.url).host}`)
		expect(lines[1]).toBe(`dump: ${dated}, snapshot ${manifest.snapshot_at}`)
		for (const [index, file] of manifest.files.entries()) {
			expect(lines[2 + index]).toBe(`verified ${file.name}: ${file.lines} ${file.lines === 1 ? 'line' : 'lines'}, ${file.bytes} bytes`)
		}
		const count = (name: string) => manifest.files.find((file) => file.name === `${name}.ndjson.gz`)!.lines
		expect(lines[7]).toBe(
			`loaded: ${count('sources')} sources, ${count('entities')} entities, ${count('records')} records, ${count('groupings')} groupings, ${count('merges')} merges`,
		)
		expect(lines[8]).toMatch(/^done in \d+\.\d s$/)
	})

	test('every /id/{opid}?history=1 and every /source answers identically from both', async () => {
		const all = await opids(indexA.sql)
		expect(all.length).toBeGreaterThan(0)
		expect(await opids(indexB.sql)).toEqual(all)
		let merged = 0
		for (const opid of all) {
			for (const history of [true, false]) {
				const a = await readEntity(indexA.sql, opid, { history })
				expect(await readEntity(indexB.sql, opid, { history })).toEqual(a)
				if (history && a.found && a.merged) merged += 1
			}
		}
		expect(merged).toBe(1)
		for (const name of [ACME.name, CANARY.name]) {
			const a = await readSourceStatus(indexA.sql, name)
			expect(a).not.toBeNull()
			expect(await readSourceStatus(indexB.sql, name)).toEqual(a)
		}
	})

	test('a re-crawl of the same feeds against the loaded index mints no new entity', async () => {
		const before = await entityCount(indexB.sql)
		const later = new Date()
		await crawlFeed(indexB.sql, { ...ACME, lines: await feedLines(ITEMS), now: later })
		await crawlFeed(indexB.sql, { ...CANARY, lines: await feedLines(MERCHANT), now: later })
		expect(await entityCount(indexB.sql)).toBe(before)
		const restored = await indexB.sql<{ count: number }[]>`select count(*)::int as count from record where withdrawn_at is not null`
		expect(restored[0]!.count).toBe(0)
	})

	test('an index that is not empty is refused', async () => {
		await expect(runLoadDump(operator(indexB.url), dated, { log: () => {} })).rejects.toThrow(/not empty/)
	})

	test('a dump is loaded from a URL through its latest.json', async () => {
		const server = Bun.serve({
			port: 0,
			fetch: (request) => {
				const file = Bun.file(join(out, decodeURIComponent(new URL(request.url).pathname)))
				return file.exists().then((exists) => (exists ? new Response(file) : new Response('not found', { status: 404 })))
			},
		})
		try {
			const target = await database()
			const log: string[] = []
			const loaded = await runLoadDump(operator(target.url), `${server.url.origin}/v1/latest.json`, { log: (line) => log.push(line) })
			expect(log[1]).toBe(`dump: ${server.url.origin}/v1/${manifest.snapshot_at.slice(0, 10)}/, snapshot ${manifest.snapshot_at}`)
			expect(loaded.entities).toBe(manifest.files.find((file) => file.name === 'entities.ndjson.gz')!.lines)
			expect(await opids(target.sql)).toEqual(await opids(indexA.sql))
		} finally {
			server.stop(true)
		}
	})

	test('a v0 dump, a v0 manifest with unversioned source and entity lines, loads to the same index', async () => {
		const v0 = await directory()
		await asV0(dated, v0)
		const target = await database()
		const loaded = await runLoadDump(operator(target.url), v0, { log: () => {} })
		expect(loaded.entities).toBe(manifest.files.find((file) => file.name === 'entities.ndjson.gz')!.lines)
		for (const opid of await opids(indexA.sql)) {
			expect(await readEntity(target.sql, opid, { history: true })).toEqual(await readEntity(indexA.sql, opid, { history: true }))
		}
		for (const name of [ACME.name, CANARY.name])
			expect(await readSourceStatus(target.sql, name)).toEqual(await readSourceStatus(indexA.sql, name))
	})

	test('the empty-index vectors of v0 and v1 load as an empty index', async () => {
		const empty = Bun.gzipSync(new Uint8Array())
		const digest = new Bun.CryptoHasher('sha256').update(empty).digest('hex')
		for (const version of ['', 'v1/']) {
			const vector: DumpManifest = await Bun.file(
				new URL(`../../../spec/fixtures/${version}dump/valid/empty-index.json`, import.meta.url),
			).json()
			const dump = join(await directory(), vector.snapshot_at.slice(0, 10))
			await mkdir(dump)
			for (const file of vector.files) await Bun.write(join(dump, file.name), empty)
			const files = vector.files.map((file) => ({ ...file, sha256: digest, bytes: empty.length }))
			await writeFile(join(dump, '..', 'latest.json'), JSON.stringify({ ...vector, files }))
			const target = await database()
			const loaded = await runLoadDump(operator(target.url), join(dump, '..', 'latest.json'), { log: () => {} })
			expect(loaded).toMatchObject({ sources: 0, entities: 0, records: 0, groupings: 0, merges: 0 })
		}
	})

	test('a file that does not match its manifest is refused before anything is written', async () => {
		const tampered = await directory()
		await cp(dated, tampered, { recursive: true })
		const path = join(tampered, 'records.ndjson.gz')
		const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
		bytes[bytes.length - 1]! ^= 0xff
		await Bun.write(path, bytes)

		const target = await database()
		const log: string[] = []
		const failure = await runLoadDump(operator(target.url), tampered, { log: (line) => log.push(line) }).catch((error: unknown) => error)
		expect(failure).toBeInstanceOf(Error)
		expect((failure as Error).message).toStartWith('records.ndjson.gz: ')
		expect(log.filter((line) => line.startsWith('verified '))).toEqual([
			expect.stringMatching(/^verified sources\.ndjson\.gz: /),
			expect.stringMatching(/^verified entities\.ndjson\.gz: /),
		])
		expect(await entityCount(target.sql)).toBe(0)
		const [sources] = await target.sql<{ count: number }[]>`select count(*)::int as count from source`
		expect(sources!.count).toBe(0)
	})
})

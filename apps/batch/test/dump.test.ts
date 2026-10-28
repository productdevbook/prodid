import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type DumpManifest, validateDump } from '@prodid/core'
import { DUMP_FILES, readSnapshot } from '@prodid/store'
import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

import { bucketTarget, directoryTarget, keptDates, PART_BYTES, runDump } from '../src/dump'
import { populate } from './support'
import { type FakeBucket, fakeBucket } from './support/s3'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

describe('dump refuses before touching anything', () => {
	test('without DATABASE_URL', async () => {
		const run = await cli(['dump', '--out', '/nonexistent'], {})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('DATABASE_URL is not set')
		expect(run.stdout).toBe('')
	})

	test('without --out and without the R2 variables, naming each', async () => {
		const run = await cli(['dump'], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', R2_ENDPOINT: 'http://127.0.0.1:1' })
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_DUMPS_BUCKET are not set')
		expect(run.stdout).toBe('')
	})
})

test('a file larger than a part goes up as a multipart upload, whole', async () => {
	const parts = fakeBucket('prodid-dumps')
	try {
		const target = bucketTarget({
			R2_ENDPOINT: parts.url,
			R2_ACCESS_KEY_ID: 'k',
			R2_SECRET_ACCESS_KEY: 's',
			R2_DUMPS_BUCKET: 'prodid-dumps',
		})
		const chunk = crypto.getRandomValues(new Uint8Array(65_536))
		const chunks = Math.ceil((PART_BYTES * 2.5) / chunk.length)
		let sent = 0
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent++ >= chunks) controller.close()
				else controller.enqueue(chunk)
			},
		})
		await target.write('v0/2026-01-01/entities.ndjson.gz', body, 'application/gzip')
		expect(parts.multipart).toBe(1)
		expect(parts.objects.get('v0/2026-01-01/entities.ndjson.gz')!.body.length).toBe(chunks * chunk.length)
	} finally {
		parts.stop()
	}
})

describe('retention', () => {
	test('keeps the last seven days and the first dump of every month', () => {
		const dates = [
			'2025-12-30',
			'2026-01-04',
			'2026-01-09',
			'2026-02-01',
			'2026-02-02',
			'2026-02-20',
			'2026-02-21',
			'2026-02-27',
			'2026-03-01',
		]
		expect([...keptDates(dates, '2026-03-01')].sort()).toEqual(['2025-12-30', '2026-01-04', '2026-02-01', '2026-02-27', '2026-03-01'])
		expect([...keptDates(['2026-02-21', '2026-02-22'], '2026-02-28')].sort()).toEqual(['2026-02-21', '2026-02-22'])
		expect([...keptDates(['2026-02-20', '2026-02-21', '2026-02-22'], '2026-02-28')].sort()).toEqual(['2026-02-20', '2026-02-22'])
	})
})

const reachable = await databaseReachable()
let database: Throwaway | null = null
let bucket: FakeBucket | null = null
const scratch: string[] = []

beforeAll(async () => {
	if (!reachable) return
	database = await createDatabase()
	await populate(database.sql, new Date(Date.now() - 86_400_000))
})

afterAll(async () => {
	bucket?.stop()
	await database?.drop()
	for (const path of scratch) await rm(path, { recursive: true, force: true })
})

async function directory(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), 'prodid-dump-'))
	scratch.push(path)
	return path
}

async function expectedLines(): Promise<Record<string, string[]>> {
	const lines: Record<string, string[]> = {}
	await readSnapshot(database!.sql, async (snapshot) => {
		const sources = {
			sources: snapshot.sources(),
			entities: snapshot.entities(),
			records: snapshot.records(),
			groupings: snapshot.groupings(),
			merges: snapshot.merges(),
		}
		for (const [name, iterator] of Object.entries(sources)) {
			const all: string[] = []
			for await (const line of iterator) all.push(JSON.stringify(line))
			lines[`${name}.ndjson.gz`] = all
		}
	})
	return lines
}

function decompressed(bytes: Uint8Array<ArrayBuffer>): string[] {
	const text = new TextDecoder().decode(Bun.gunzipSync(bytes))
	expect(text === '' || text.endsWith('\n')).toBe(true)
	return text.split('\n').slice(0, -1)
}

function sha256(bytes: Uint8Array<ArrayBuffer>): string {
	return new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
}

describe.skipIf(!reachable)('dump to a directory', () => {
	let out: string
	let log: string[]
	let manifest: DumpManifest

	beforeAll(async () => {
		out = await directory()
		log = []
		manifest = (await runDump(database!.url, directoryTarget(out), { log: (line) => log.push(line), page: 2 })).manifest
	})

	test('every file is the snapshot it names, counted and digested as served', async () => {
		expect(validateDump(manifest).ok).toBe(true)
		expect(manifest.files.map((file) => file.name)).toEqual([...DUMP_FILES])
		const date = manifest.snapshot_at.slice(0, 10)
		const expected = await expectedLines()
		for (const file of manifest.files) {
			const bytes = new Uint8Array(await Bun.file(join(out, 'v0', date, file.name)).arrayBuffer())
			expect(bytes.length).toBe(file.bytes)
			expect(sha256(bytes)).toBe(file.sha256)
			const lines = decompressed(bytes)
			expect(lines).toHaveLength(file.lines)
			expect(lines).toEqual(expected[file.name]!)
		}
		expect(manifest.files.find((file) => file.name === 'merges.ndjson.gz')!.lines).toBe(1)
		expect(manifest.files.find((file) => file.name === 'sources.ndjson.gz')!.lines).toBe(2)
		expect(Date.parse(manifest.created_at)).toBeGreaterThanOrEqual(Date.parse(manifest.snapshot_at))
	})

	test('latest.json is the manifest, byte for byte, and nothing else is left behind', async () => {
		const date = manifest.snapshot_at.slice(0, 10)
		const written = await Bun.file(join(out, 'v0', date, 'manifest.json')).text()
		expect(JSON.parse(written)).toEqual(manifest)
		expect(await Bun.file(join(out, 'v0', 'latest.json')).text()).toBe(written)
		expect((await readdir(join(out, 'v0', date))).sort()).toEqual([...DUMP_FILES, 'manifest.json'].sort())
	})

	test('it prints the host, then lines, bytes and time per file, the manifest and latest.json last', () => {
		const date = manifest.snapshot_at.slice(0, 10)
		expect(log[0]).toBe(`database: ${new URL(database!.url).host}`)
		expect(log[1]).toBe(`target: directory ${out}`)
		expect(log[2]).toBe(`snapshot: ${manifest.snapshot_at}`)
		for (const [index, file] of manifest.files.entries()) {
			expect(log[3 + index]).toMatch(
				new RegExp(
					`^${file.name.replaceAll('.', '\\.')}: ${file.lines} ${file.lines === 1 ? 'line' : 'lines'}, ${file.bytes} bytes, \\d+\\.\\d s$`,
				),
			)
		}
		expect(log.slice(8)).toEqual([
			`manifest: v0/${date}/manifest.json`,
			'latest: v0/latest.json',
			expect.stringMatching(/^done in \d+\.\d s$/),
		])
	})

	test('a second dump on the same date is refused and changes nothing', async () => {
		const before = await Bun.file(join(out, 'v0', 'latest.json')).text()
		await expect(runDump(database!.url, directoryTarget(out), { log: () => {} })).rejects.toThrow(
			/already exists; a written dump is never rewritten/,
		)
		expect(await Bun.file(join(out, 'v0', 'latest.json')).text()).toBe(before)
	})

	test('older dumps retention no longer keeps are removed, month firsts stay', async () => {
		const kept = await directory()
		const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
		for (const date of ['2020-01-05', '2020-01-09', '2020-02-03', '2020-02-10', yesterday]) {
			await mkdir(join(kept, 'v0', date), { recursive: true })
			for (const name of ['manifest.json', 'sources.ndjson.gz']) await writeFile(join(kept, 'v0', date, name), 'x')
		}
		const log: string[] = []
		const run = await runDump(database!.url, directoryTarget(kept), { log: (line) => log.push(line) })
		expect(run.removed).toEqual(['v0/2020-01-09/', 'v0/2020-02-10/'])
		expect(log).toContain('retention: removed v0/2020-01-09/')
		const today = run.manifest.snapshot_at.slice(0, 10)
		expect((await readdir(join(kept, 'v0'))).sort()).toEqual(
			['2020-01-05', '2020-02-03', ...new Set([yesterday, today]), 'latest.json'].sort(),
		)
	})
})

describe.skipIf(!reachable)('dump to the bucket', () => {
	const env = () => ({ R2_ENDPOINT: bucket!.url, R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_DUMPS_BUCKET: 'prodid-dumps' })

	beforeAll(() => {
		bucket = fakeBucket('prodid-dumps')
	})

	test('a failed upload writes no manifest and no latest.json, and the next run completes', async () => {
		bucket!.failPut = (key) => key.endsWith('records.ndjson.gz')
		await expect(runDump(database!.url, bucketTarget(env()), { log: () => {} })).rejects.toThrow()
		expect([...bucket!.objects.keys()].some((key) => key.endsWith('.json'))).toBe(false)
		bucket!.failPut = null
		bucket!.completed = []

		bucket!.objects.set('v0/2020-03-02/manifest.json', { body: new Uint8Array([1]), type: null })
		bucket!.objects.set('v0/2020-03-09/manifest.json', { body: new Uint8Array([1]), type: null })
		bucket!.objects.set('v0/2020-03-09/entities.ndjson.gz', { body: new Uint8Array([1]), type: null })
		const log: string[] = []
		const run = await runDump(database!.url, bucketTarget(env()), { log: (line) => log.push(line) })
		expect(log[1]).toBe('target: bucket prodid-dumps')

		const directory = `v0/${run.manifest.snapshot_at.slice(0, 10)}/`
		expect(bucket!.completed).toEqual([...DUMP_FILES.map((name) => `${directory}${name}`), `${directory}manifest.json`, 'v0/latest.json'])
		for (const file of run.manifest.files) {
			const object = bucket!.objects.get(`${directory}${file.name}`)!
			expect(object.type).toBe('application/gzip')
			expect(object.body.length).toBe(file.bytes)
			expect(sha256(object.body)).toBe(file.sha256)
			expect(decompressed(object.body)).toHaveLength(file.lines)
		}
		const latest = bucket!.objects.get('v0/latest.json')!
		expect(latest.type).toStartWith('application/json')
		expect(latest.body).toEqual(bucket!.objects.get(`${directory}manifest.json`)!.body)
		expect(JSON.parse(new TextDecoder().decode(latest.body))).toEqual(run.manifest)

		expect(run.removed).toEqual(['v0/2020-03-09/'])
		expect(bucket!.deleted.sort()).toEqual(['v0/2020-03-09/entities.ndjson.gz', 'v0/2020-03-09/manifest.json'])
		expect(bucket!.objects.has('v0/2020-03-02/manifest.json')).toBe(true)
	})
})

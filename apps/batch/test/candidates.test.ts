import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { ItemRecord } from '@prodid/core'
import { ingestRecord, prepareRecord } from '@prodid/store'
import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname
const UNREACHABLE = 'postgres://prodid:prodid@127.0.0.1:1/prodid'

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

describe('candidates refuses before touching anything', () => {
	test('without DATABASE_URL', async () => {
		const run = await cli(['candidates'], {})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('DATABASE_URL is not set')
		expect(run.stdout).toBe('')
	})

	test('with a limit that is not a positive integer', async () => {
		for (const limit of ['0', '-3', '2.5', 'ten', '']) {
			const run = await cli(['candidates', `--limit=${limit}`], { DATABASE_URL: UNREACHABLE })
			expect(run.code).toBe(1)
			expect(run.stderr).toContain(`--limit ${limit} is not a positive integer`)
			expect(run.stdout).toBe('')
		}
	})
})

const reachable = await databaseReachable()
let database: Throwaway | null = null
const opids: Record<string, string> = {}

function item(key: string, brand: string, name: string, sku: string): ItemRecord {
	return { $type: 'org.prodid.item', key, brand, name, lang: 'en', identifiers: [{ scheme: 'sku', value: sku }] }
}

beforeAll(async () => {
	if (!reachable) return
	database = await createDatabase()
	const sql = database.sql
	const now = new Date('2026-10-01T00:00:00Z')
	for (const [source, records] of [
		['maker.example', [item('w1', 'ARÇELİK', 'Washer 9 kg', 'M-1'), item('d1', 'Acme', 'Dryer', 'M-2'), item('o1', 'Acme', 'Oven', 'M-3')]],
		[
			'shop.example',
			[item('x7', '  Arçelik ', 'Washer 9 kg', 'S-7'), item('d2', 'Acme', 'Dryer', 'S-8'), item('f1', 'Acme', 'Fridge', 'S-9')],
		],
	] as const) {
		const [row] = await sql<{ id: string }[]>`insert into source (kind, name) values ('domain', ${source}) returning id::text`
		for (const record of records) {
			const prepared = await prepareRecord(record, row!.id)
			if (!prepared.ok) throw new Error(prepared.error)
			opids[`${source}/${record.key}`] = (await ingestRecord(sql, { source: row!.id, record: prepared.prepared, now })).opid
		}
	}
})

afterAll(async () => {
	await database?.drop()
})

function expectedLines(): string[] {
	const pair = (left: string, right: string, brand: string, name: string) => {
		const [a, b] = [left, right].sort((x, y) => (opids[x]! < opids[y]! ? -1 : 1))
		return [opids[a!], a!.split('/')[0], opids[b!], b!.split('/')[0], JSON.stringify(brand), JSON.stringify(name)].join('\t')
	}
	return [
		pair('maker.example/d1', 'shop.example/d2', 'acme', 'Dryer'),
		pair('maker.example/w1', 'shop.example/x7', 'arçelik', 'Washer 9 kg'),
	]
}

describe.skipIf(!reachable)('candidates against a database', () => {
	test('prints the host, then one line per pair with both opids and both sources, then the count', async () => {
		const host = new URL(database!.url).host
		const run = await cli(['candidates'], { DATABASE_URL: database!.url })
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		expect(run.stdout).toBe([`database: ${host}`, ...expectedLines(), '2 pairs', ''].join('\n'))
	})

	test('--limit caps the pairs and says when it was reached', async () => {
		const run = await cli(['candidates', '--limit', '1'], { DATABASE_URL: database!.url })
		expect(run.code).toBe(0)
		const lines = run.stdout.trimEnd().split('\n')
		expect(lines).toHaveLength(3)
		expect(lines[1]).toBe(expectedLines()[0]!)
		expect(lines[2]).toBe('1 pair, the limit; raise --limit for more')
	})

	test('it writes nothing', async () => {
		const before = await database!.sql<{ count: number }[]>`select count(*)::int as count from merge`
		await cli(['candidates'], { DATABASE_URL: database!.url })
		const after = await database!.sql<{ count: number }[]>`select count(*)::int as count from merge`
		expect(after[0]!.count).toBe(before[0]!.count)
	})
})

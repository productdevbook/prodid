import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

import { runBlockMedia, type TakedownEnv } from '../src/takedown'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname
const HEX = 'ab'.repeat(32)
const OTHER = 'cd'.repeat(32)
const MEDIA_URL = `https://media.prodid.org/sha256/${HEX}`

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

describe('block-media refuses before touching anything', () => {
	test('without DATABASE_URL', async () => {
		const run = await cli(['block-media', HEX, '--reason', 'notice'], {
			R2_ENDPOINT: 'http://127.0.0.1:1',
			R2_ACCESS_KEY_ID: 'k',
			R2_SECRET_ACCESS_KEY: 's',
			R2_MEDIA_BUCKET: 'prodid-media',
			CLOUDFLARE_API_TOKEN: 't',
			CLOUDFLARE_ZONE_ID: 'z',
		})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('DATABASE_URL is not set')
		expect(run.stdout).toBe('')
	})

	test('without the R2 and Cloudflare variables, naming each', async () => {
		const run = await cli(['block-media', HEX, '--reason', 'notice'], {
			DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x',
			R2_ENDPOINT: 'http://127.0.0.1:1',
		})
		expect(run.code).toBe(1)
		expect(run.stderr).toContain(
			'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MEDIA_BUCKET, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID are not set',
		)
		expect(run.stdout).toBe('')
	})

	test('without a digest or a reason', async () => {
		const bad = await cli(['block-media', 'abc', '--reason', 'notice'], {})
		expect(bad.code).toBe(1)
		expect(bad.stderr).toContain('abc is not a sha256 hex digest')
		const reasonless = await cli(['block-media', HEX], {})
		expect(reasonless.code).toBe(1)
		expect(reasonless.stderr).toContain('missing --reason')
	})
})

interface Fakes {
	deletes: string[]
	purges: { url: string; authorization: string | null; body: unknown }[]
	r2Fails: boolean
	purgeFails: boolean
}

const fakes: Fakes = { deletes: [], purges: [], r2Fails: false, purgeFails: false }

const r2 = Bun.serve({
	port: 0,
	fetch(request) {
		if (request.method === 'DELETE') fakes.deletes.push(new URL(request.url).pathname)
		return fakes.r2Fails ? new Response('<Error><Code>InternalError</Code></Error>', { status: 500 }) : new Response(null, { status: 204 })
	},
})

async function purgeApi(request: Request): Promise<Response> {
	fakes.purges.push({ url: request.url, authorization: request.headers.get('authorization'), body: await request.json() })
	return fakes.purgeFails
		? Response.json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, { status: 403 })
		: Response.json({ success: true, errors: [], result: { id: 'z' } })
}

function reset(): void {
	fakes.deletes = []
	fakes.purges = []
	fakes.r2Fails = false
	fakes.purgeFails = false
}

const reachable = await databaseReachable()
let database: Throwaway | null = null

beforeAll(async () => {
	if (!reachable) return
	database = await createDatabase()
	const sql = database.sql
	const [source] = await sql<{ id: string }[]>`insert into source (kind, name) values ('community', 'acme.example') returning id::text`
	await sql`insert into entity (opid, kind) values ('0000000000000001', 'family'), ('0000000000000002', 'family')`
	const claim = (opid: string, sha256: string) => ({ url: `https://cdn.example/${opid}.png`, sha256, license: 'CC-BY-4.0' })
	for (const [opid, sha256] of [
		['0000000000000001', HEX],
		['0000000000000002', HEX],
		['0000000000000002', OTHER],
	] as const) {
		await sql`insert into claim (opid, property, value, source) values (${opid}, 'media', ${sql.json(claim(opid, sha256))}, ${source!.id})`
	}
})

afterAll(async () => {
	r2.stop(true)
	await database?.drop()
})

function env(databaseUrl: string): TakedownEnv {
	return {
		DATABASE_URL: databaseUrl,
		R2_ENDPOINT: r2.url.origin,
		R2_ACCESS_KEY_ID: 'key',
		R2_SECRET_ACCESS_KEY: 'secret',
		R2_MEDIA_BUCKET: 'prodid-media',
		CLOUDFLARE_API_TOKEN: 'purge-token',
		CLOUDFLARE_ZONE_ID: 'zone-1',
	}
}

async function run(databaseUrl: string): Promise<{ ok: boolean; lines: string[] }> {
	const lines: string[] = []
	const ok = await runBlockMedia(
		env(databaseUrl),
		{ sha256: HEX, reason: 'copyright notice 2026-10-01', now: new Date('2026-10-28T12:00:00Z') },
		{ cloudflareApi: 'https://api.test/client/v4', log: (line) => lines.push(line), send: purgeApi },
	)
	return { ok, lines }
}

describe.skipIf(!reachable)('block-media', () => {
	test('a failed block stops the run before the file is touched', async () => {
		reset()
		const result = await run('postgres://prodid:prodid@127.0.0.1:1/prodid')
		expect(result.ok).toBe(false)
		expect(result.lines[0]).toBe('database: 127.0.0.1:1')
		expect(result.lines[1]).toStartWith('block: failed, ')
		expect(result.lines).toHaveLength(2)
		expect(fakes.deletes).toEqual([])
		expect(fakes.purges).toEqual([])
	})

	test('failed delete and purge exit non-zero, and a second run finishes them', async () => {
		reset()
		fakes.r2Fails = true
		fakes.purgeFails = true
		const first = await run(database!.url)
		expect(first.ok).toBe(false)
		expect(first.lines[0]).toBe(`database: ${new URL(database!.url).host}`)
		expect(first.lines[1]).toBe('block: ok, 2 claims withdrawn')
		expect(first.lines[2]).toStartWith('delete: failed, ')
		expect(first.lines[3]).toBe('purge: failed, Cloudflare answered 403: 10000 Authentication error')
		expect(fakes.deletes.length).toBeGreaterThan(0)

		const [row] = await database!.sql<{ blocked_at: Date; blocked_reason: string }[]>`
			select blocked_at, blocked_reason from media where sha256 = ${HEX}
		`
		expect(row).toEqual({ blocked_at: new Date('2026-10-28T12:00:00Z'), blocked_reason: 'copyright notice 2026-10-01' })
		const active = await database!.sql<{ sha256: string }[]>`
			select value->>'sha256' as sha256 from claim where property = 'media' and withdrawn_at is null
		`
		expect([...active]).toEqual([{ sha256: OTHER }])

		reset()
		const second = await run(database!.url)
		expect(second).toEqual({
			ok: true,
			lines: [
				`database: ${new URL(database!.url).host}`,
				'block: ok, 0 claims withdrawn',
				`delete: ok, prodid-media/sha256/${HEX}`,
				`purge: ok, ${MEDIA_URL}`,
			],
		})
		expect(fakes.deletes).toEqual([`/prodid-media/sha256/${HEX}`])
		expect(fakes.purges).toEqual([
			{ url: 'https://api.test/client/v4/zones/zone-1/purge_cache', authorization: 'Bearer purge-token', body: { files: [MEDIA_URL] } },
		])
	})
})

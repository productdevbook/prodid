import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { readEntity } from '@prodid/store'
import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname
const A = '000000000000000a'
const B = '000000000000000b'
const C = '000000000000000c'
const PARENT = '000000000000000p'
const VARIANT = '000000000000000v'
const MISSING = '000000000000000z'

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

const UNREACHABLE = 'postgres://prodid:prodid@127.0.0.1:1/prodid'

describe('merge and unmerge refuse before touching anything', () => {
	test('without DATABASE_URL', async () => {
		const merge = await cli(['merge', A, B, '--reason', 'same product'], { PRODID_OPERATOR: 'octocat' })
		expect(merge.code).toBe(1)
		expect(merge.stderr).toContain('DATABASE_URL is not set')
		expect(merge.stdout).toBe('')
		const unmerge = await cli(['unmerge', A], {})
		expect(unmerge.code).toBe(1)
		expect(unmerge.stderr).toContain('DATABASE_URL is not set')
		expect(unmerge.stdout).toBe('')
	})

	test('without PRODID_OPERATOR', async () => {
		const run = await cli(['merge', A, B, '--reason', 'same product'], { DATABASE_URL: UNREACHABLE })
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('PRODID_OPERATOR is not set')
		expect(run.stdout).toBe('')
	})

	test('without a reason, with an empty one, or with one over 500 characters', async () => {
		const env = { DATABASE_URL: UNREACHABLE, PRODID_OPERATOR: 'octocat' }
		const missing = await cli(['merge', A, B], env)
		expect(missing.code).toBe(1)
		expect(missing.stderr).toContain('missing --reason')
		const empty = await cli(['merge', A, B, '--reason', '  '], env)
		expect(empty.code).toBe(1)
		expect(empty.stderr).toContain('--reason is empty')
		const long = await cli(['merge', A, B, '--reason', 'x'.repeat(501)], env)
		expect(long.code).toBe(1)
		expect(long.stderr).toContain('--reason is 501 characters, at most 500')
		for (const run of [missing, empty, long]) expect(run.stdout).toBe('')
	})

	test('without two opids, or with something that is not one', async () => {
		const env = { DATABASE_URL: UNREACHABLE, PRODID_OPERATOR: 'octocat' }
		const one = await cli(['merge', A, '--reason', 'same product'], env)
		expect(one.stderr).toContain('missing into-opid')
		const bad = await cli(['merge', A, 'not-an-opid', '--reason', 'same product'], env)
		expect(bad.code).toBe(1)
		expect(bad.stderr).toContain('not-an-opid is not an opid')
		const self = await cli(['merge', A, A, '--reason', 'same product'], env)
		expect(self.code).toBe(1)
		expect(self.stderr).toContain(`cannot merge ${A} into itself`)
		for (const run of [one, bad, self]) expect(run.stdout).toBe('')
	})
})

const reachable = await databaseReachable()
let database: Throwaway | null = null

beforeAll(async () => {
	if (!reachable) return
	database = await createDatabase()
	const sql = database.sql
	const [source] = await sql<{ id: string }[]>`insert into source (kind, name) values ('community', 'acme.example') returning id::text`
	await sql`insert into entity (opid, kind) values (${A}, 'family'), (${B}, 'family'), (${C}, 'family'), (${PARENT}, 'family')`
	await sql`insert into entity (opid, kind, parent) values (${VARIANT}, 'variant', ${PARENT})`
	await sql`
		insert into identifier (opid, scheme, scope, value, first_source)
		values (${A}, 'gtin', '', '04006381333931', ${source!.id}), (${B}, 'gtin', '', '00012345600012', ${source!.id})
	`
	for (const [opid, name] of [
		[A, 'Widget'],
		[B, 'Widget Pro'],
	] as const) {
		await sql`insert into claim (opid, property, value, source) values (${opid}, 'name', ${sql.json(name)}, ${source!.id})`
	}
})

afterAll(async () => {
	await database?.drop()
})

function env(): Record<string, string> {
	return { DATABASE_URL: database!.url, PRODID_OPERATOR: 'octocat' }
}

describe.skipIf(!reachable)('merge and unmerge against a database', () => {
	test('merge moves A into B: A answers with the survivor, B lists A in merged_from', async () => {
		const host = new URL(database!.url).host
		const run = await cli(['merge', A, B, '--reason', 'same product, two GTINs'], env())
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		const [logged] = await database!.sql<{ id: string; into_opid: string; reason: string; decided_by: string }[]>`
			select id::text, into_opid, reason, decided_by from merge where from_opid = ${A} and reverted_at is null
		`
		expect(logged).toMatchObject({ into_opid: B, reason: 'same product, two GTINs', decided_by: 'octocat' })
		expect(run.stdout).toBe(`database: ${host}\nmerge: ${logged!.id}\nsurvivor: ${B}\n`)

		expect(await readEntity(database!.sql, A)).toEqual({ found: true, merged: true, survivor: B })
		const survivor = await readEntity(database!.sql, B)
		if (!survivor.found || survivor.merged) throw new Error('B should resolve on its own')
		expect(survivor.entity.merged_from).toEqual([A])
		expect(survivor.entity.identifiers.map((identifier) => identifier.value).sort()).toEqual(['00012345600012', '04006381333931'])
		expect(survivor.entity.claims.map((claim) => claim.value).sort()).toEqual(['Widget', 'Widget Pro'])
	})

	test('an opid already merged is refused, and nothing changes', async () => {
		const run = await cli(['merge', A, C, '--reason', 'second thoughts'], env())
		expect(run.code).toBe(1)
		expect(run.stderr).toContain(`${A} is already merged into ${B}; unmerge it first`)
		expect(await readEntity(database!.sql, A)).toEqual({ found: true, merged: true, survivor: B })
	})

	test('merging the survivor repoints what pointed at it', async () => {
		const run = await cli(['merge', B, C, '--reason', 'all the same'], env())
		expect(run.code).toBe(0)
		expect(run.stdout).toContain(`survivor: ${C}\nrepointed: ${A} -> ${C}\n`)
		expect(await readEntity(database!.sql, A)).toEqual({ found: true, merged: true, survivor: C })
		expect(await readEntity(database!.sql, B)).toEqual({ found: true, merged: true, survivor: C })

		const back = await cli(['unmerge', B], env())
		expect(back.code).toBe(0)
		const reset = await cli(['unmerge', A], env())
		expect(reset.code).toBe(0)
		const again = await cli(['merge', A, B, '--reason', 'same product, two GTINs'], env())
		expect(again.code).toBe(0)
	})

	test('unmerge restores both sides, each with what it held', async () => {
		const host = new URL(database!.url).host
		const run = await cli(['unmerge', A], env())
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		expect(run.stdout).toBe(`database: ${host}\nunmerged: ${A} from ${B}\n${A} resolves to ${A}\n${B} resolves to ${B}\n`)

		const a = await readEntity(database!.sql, A)
		const b = await readEntity(database!.sql, B)
		if (!a.found || a.merged || !b.found || b.merged) throw new Error('both should resolve on their own')
		expect(a.entity.merged_from).toBeUndefined()
		expect(b.entity.merged_from).toBeUndefined()
		expect(a.entity.identifiers.map((identifier) => identifier.value)).toEqual(['04006381333931'])
		expect(b.entity.identifiers.map((identifier) => identifier.value)).toEqual(['00012345600012'])
		expect(a.entity.claims.map((claim) => claim.value)).toEqual(['Widget'])
		expect(b.entity.claims.map((claim) => claim.value)).toEqual(['Widget Pro'])

		const reverted = await database!.sql<{ count: number }[]>`
			select count(*)::int as count from merge where from_opid = ${A} and reverted_at is not null
		`
		expect(reverted[0]!.count).toBe(3)
	})

	test('unmerge of an opid that is not merged, or does not exist, is refused', async () => {
		const plain = await cli(['unmerge', A], env())
		expect(plain.code).toBe(1)
		expect(plain.stderr).toContain(`${A} is not merged`)
		const missing = await cli(['unmerge', MISSING], env())
		expect(missing.code).toBe(1)
		expect(missing.stderr).toContain(`entity ${MISSING} does not exist`)
	})

	test('different kinds and unknown opids are refused, and nothing changes', async () => {
		const kinds = await cli(['merge', A, VARIANT, '--reason', 'wrong'], env())
		expect(kinds.code).toBe(1)
		expect(kinds.stderr).toContain(`cannot merge family ${A} into variant ${VARIANT}; the kinds differ`)
		const missing = await cli(['merge', A, MISSING, '--reason', 'wrong'], env())
		expect(missing.code).toBe(1)
		expect(missing.stderr).toContain(`entity ${MISSING} does not exist`)
		const active = await database!.sql<{ count: number }[]>`select count(*)::int as count from merge where reverted_at is null`
		expect(active[0]!.count).toBe(0)
		expect((await readEntity(database!.sql, A)).found).toBe(true)
	})
})

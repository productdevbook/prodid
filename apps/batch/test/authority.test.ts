import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { listAuthority, readSourceStatus } from '@prodid/store'
import { createDatabase, databaseReachable, type Throwaway } from '@prodid/store/testing'

const CLI = new URL('../src/cli.ts', import.meta.url).pathname
const EVIDENCE = 'https://www.gs1.org/services/verified-by-gs1/results?gtin=04006381333931'
const UNREACHABLE = 'postgres://prodid:prodid@127.0.0.1:1/prodid'

async function cli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(['bun', CLI, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' })
	const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
	return { code, stdout, stderr }
}

describe('grant-authority and revoke-authority refuse before touching anything', () => {
	test('without DATABASE_URL', async () => {
		const grant = await cli(['grant-authority', 'acme.example', 'Acme', '--evidence', EVIDENCE], { PRODID_OPERATOR: 'octocat' })
		expect(grant.code).toBe(1)
		expect(grant.stderr).toContain('DATABASE_URL is not set')
		const revoke = await cli(['revoke-authority', '1', '--reason', 'owner asked'], {})
		expect(revoke.code).toBe(1)
		expect(revoke.stderr).toContain('DATABASE_URL is not set')
		for (const run of [grant, revoke]) expect(run.stdout).toBe('')
	})

	test('grant-authority without PRODID_OPERATOR', async () => {
		const run = await cli(['grant-authority', 'acme.example', 'Acme', '--evidence', EVIDENCE], { DATABASE_URL: UNREACHABLE })
		expect(run.code).toBe(1)
		expect(run.stderr).toContain('PRODID_OPERATOR is not set')
		expect(run.stdout).toBe('')
	})

	test('grant-authority without a brand, or evidence, or with evidence that is not https', async () => {
		const env = { DATABASE_URL: UNREACHABLE, PRODID_OPERATOR: 'octocat' }
		const noBrand = await cli(['grant-authority', 'acme.example', '--evidence', EVIDENCE], env)
		expect(noBrand.stderr).toContain('missing brand')
		const blank = await cli(['grant-authority', 'acme.example', '  ', '--evidence', EVIDENCE], env)
		expect(blank.stderr).toContain('the brand is empty')
		const noEvidence = await cli(['grant-authority', 'acme.example', 'Acme'], env)
		expect(noEvidence.stderr).toContain('missing --evidence')
		const plain = await cli(['grant-authority', 'acme.example', 'Acme', '--evidence', 'http://www.gs1.org/'], env)
		expect(plain.stderr).toContain('--evidence http://www.gs1.org/ is not an https URL')
		for (const run of [noBrand, blank, noEvidence, plain]) {
			expect(run.code).toBe(1)
			expect(run.stdout).toBe('')
		}
	})

	test('revoke-authority without a reason, with an empty one or one over 500 characters, or a bad id', async () => {
		const env = { DATABASE_URL: UNREACHABLE }
		const missing = await cli(['revoke-authority', '1'], env)
		expect(missing.stderr).toContain('missing --reason')
		const empty = await cli(['revoke-authority', '1', '--reason', '  '], env)
		expect(empty.stderr).toContain('--reason is empty')
		const long = await cli(['revoke-authority', '1', '--reason', 'x'.repeat(501)], env)
		expect(long.stderr).toContain('--reason is 501 characters, at most 500')
		const bad = await cli(['revoke-authority', 'one', '--reason', 'owner asked'], env)
		expect(bad.stderr).toContain('one is not a grant id')
		for (const run of [missing, empty, long, bad]) {
			expect(run.code).toBe(1)
			expect(run.stdout).toBe('')
		}
	})
})

const reachable = await databaseReachable()
let database: Throwaway | null = null

beforeAll(async () => {
	if (!reachable) return
	database = await createDatabase()
	const sql = database.sql
	await sql`insert into source (kind, name) values ('domain', 'unproven.example'), ('community', 'community.example')`
	const [source] = await sql<{ id: string }[]>`insert into source (kind, name) values ('domain', 'acme.example') returning id::text`
	const [crawl] = await sql<{ id: string }[]>`
		insert into crawl (source, via, document_url, finished_at, outcome)
		values (${source!.id}, 'well-known', 'https://acme.example/.well-known/prodid.json', now(), 'changed')
		returning id::text
	`
	await sql`
		update source set trust = 'verified', verified_by = 'well-known', verified_at = now(), verified_crawl = ${crawl!.id}
		where id = ${source!.id}
	`
})

afterAll(async () => {
	await database?.drop()
})

function env(): Record<string, string> {
	return { DATABASE_URL: database!.url, PRODID_OPERATOR: 'octocat' }
}

async function trust(): Promise<string | undefined> {
	return (await readSourceStatus(database!.sql, 'acme.example'))?.trust
}

describe.skipIf(!reachable)('grant-authority and revoke-authority against a database', () => {
	let id = ''

	test('a grant makes the verified domain authoritative, decided by PRODID_OPERATOR', async () => {
		const host = new URL(database!.url).host
		expect(await trust()).toBe('verified')
		const run = await cli(['grant-authority', 'acme.example', 'ARÇELİK', '--evidence', EVIDENCE], env())
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		const [grant] = await listAuthority(database!.sql, 'acme.example')
		expect(grant).toMatchObject({ brand: 'arçelik', evidence: EVIDENCE, decided_by: 'octocat', revoked_at: null })
		id = grant!.id
		expect(run.stdout).toBe(
			[
				`database: ${host}`,
				`grant: ${id}`,
				'source: acme.example',
				'brand: "arçelik"',
				`evidence: ${EVIDENCE}`,
				`decided: ${grant!.decided_at.toISOString()} by octocat`,
				'trust: authoritative',
				'',
			].join('\n'),
		)
		expect(await trust()).toBe('authoritative')
	})

	test('granting the same brand again keeps the one grant', async () => {
		const run = await cli(['grant-authority', 'acme.example', ' arçelik ', '--evidence', `${EVIDENCE}&again`], env())
		expect(run.code).toBe(0)
		expect(run.stdout).toContain(`grant: ${id}, already held\n`)
		expect(run.stdout).toContain(`evidence: ${EVIDENCE}\n`)
		expect(await listAuthority(database!.sql, 'acme.example')).toHaveLength(1)
	})

	test('a source that is not a verified domain is refused, and nothing is written', async () => {
		for (const [name, message] of [
			['unproven.example', 'unproven.example is not a verified domain, so it cannot be granted authority'],
			['community.example', 'community.example is not a verified domain, so it cannot be granted authority'],
			['nobody.example', 'no source is named nobody.example'],
		] as const) {
			const run = await cli(['grant-authority', name, 'Acme', '--evidence', EVIDENCE], env())
			expect(run.code).toBe(1)
			expect(run.stderr).toBe(`${message}\n`)
			expect(await listAuthority(database!.sql, name)).toEqual([])
		}
	})

	test('revoking drops the source to verified, and a second revoke keeps the first reason', async () => {
		const host = new URL(database!.url).host
		const run = await cli(['revoke-authority', id, '--reason', '  prefix licensed elsewhere '], { DATABASE_URL: database!.url })
		expect(run.stderr).toBe('')
		expect(run.code).toBe(0)
		const [grant] = await listAuthority(database!.sql, 'acme.example')
		expect(grant).toMatchObject({ id, revoked_reason: 'prefix licensed elsewhere' })
		expect(run.stdout).toBe(
			[
				`database: ${host}`,
				`revoked: ${id}`,
				'source: acme.example',
				'brand: "arçelik"',
				`evidence: ${EVIDENCE}`,
				`decided: ${grant!.decided_at.toISOString()} by octocat`,
				`revoked at: ${grant!.revoked_at!.toISOString()}, "prefix licensed elsewhere"`,
				'trust: verified',
				'',
			].join('\n'),
		)
		expect(await trust()).toBe('verified')

		const again = await cli(['revoke-authority', id, '--reason', 'a second reason'], { DATABASE_URL: database!.url })
		expect(again.code).toBe(0)
		expect(again.stdout).toContain(`revoked: ${id}, already revoked\n`)
		expect(again.stdout).toContain(`revoked at: ${grant!.revoked_at!.toISOString()}, "prefix licensed elsewhere"\n`)
		expect(await listAuthority(database!.sql, 'acme.example')).toEqual([grant!])
	})

	test('a revoked brand can be granted again, as a new grant', async () => {
		const run = await cli(['grant-authority', 'acme.example', 'Arçelik', '--evidence', EVIDENCE], env())
		expect(run.code).toBe(0)
		const grants = await listAuthority(database!.sql, 'acme.example')
		expect(grants).toHaveLength(2)
		expect(grants[1]!.id).not.toBe(id)
		expect(run.stdout).toContain(`grant: ${grants[1]!.id}\n`)
		expect(await trust()).toBe('authoritative')
	})

	test('an unknown grant id is refused', async () => {
		const run = await cli(['revoke-authority', '999999', '--reason', 'owner asked'], { DATABASE_URL: database!.url })
		expect(run.code).toBe(1)
		expect(run.stderr).toBe('no grant has id 999999\n')
	})
})

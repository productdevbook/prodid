import { randomBytes } from 'node:crypto'

import postgres, { type ReservedSql, type Sql } from 'postgres'

import { migrate } from '../migrate'

const ROUNDS = 25
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const HASH = 'a'.repeat(64)

let minted = 0

function opid(): string {
	minted++
	let n = minted
	let out = ''
	for (let i = 0; i < 16; i++) {
		out = ALPHABET.charAt(n % 32) + out
		n = Math.floor(n / 32)
	}
	return out
}

type Outcome = Error | null

function attempt(work: PromiseLike<unknown>): Promise<Outcome> {
	return Promise.resolve(work).then(
		() => null,
		(error: unknown) => (error instanceof Error ? error : new Error(String(error))),
	)
}

function isDeadlock(error: Outcome): boolean {
	return error !== null && 'code' in error && (error as { code?: string }).code === '40P01'
}

const AUDIT: { what: string; query: string }[] = [
	{
		what: 'a merge chain',
		query: `select e.opid as bad from entity e join entity t on t.opid = e.merged_into
            where t.merged_into is not null`,
	},
	{
		what: 'a child under the wrong kind of parent',
		query: `select c.opid as bad from entity c join entity p on p.opid = c.parent
            where (c.kind = 'variant' and p.kind <> 'family')
               or (c.kind = 'item' and p.kind <> 'variant')`,
	},
	{
		what: 'a variant or item with no parent',
		query: `select opid as bad from entity where kind in ('variant','item') and parent is null`,
	},
	{
		what: 'a family with a parent',
		query: `select opid as bad from entity where kind = 'family' and parent is not null`,
	},
	{
		what: 'an active claim under a withdrawn record',
		query: `select c.id::text as bad from record r
            join claim c on c.source = r.source and c.record_key = r.key
            where r.withdrawn_at is not null and c.withdrawn_at is null`,
	},
	{
		what: 'a merged entity with no merge row saying so',
		query: `select e.opid as bad from entity e where e.merged_into is not null and not exists (
              select 1 from merge m
              where m.from_opid = e.opid and m.reverted_at is null and m.into_opid = e.merged_into
            )`,
	},
	{
		what: 'an un-reverted merge row the entity does not agree with',
		query: `select m.from_opid as bad from merge m join entity e on e.opid = m.from_opid
            where m.reverted_at is null and e.merged_into is distinct from m.into_opid`,
	},
	{
		what: 'a grouping pointing at the wrong kind of entity',
		query: `select g.key as bad from grouping g join entity e on e.opid = g.opid where g.kind <> e.kind`,
	},
]

let failures = 0

function fail(scenario: string, round: number, detail: string): void {
	failures++
	console.log(`FAIL  ${scenario} round ${round}: ${detail}`)
}

async function audit(sql: Sql, scenario: string, round: number): Promise<void> {
	for (const { what, query } of AUDIT) {
		const rows = await sql.unsafe<{ bad: string }[]>(query)
		if (rows.length > 0) fail(scenario, round, `left ${what} (${rows[0]?.bad})`)
	}
}

async function item(sql: Sql): Promise<string> {
	const family = opid()
	const variant = opid()
	const id = opid()
	await sql`insert into entity (opid, kind) values (${family}, 'family')`
	await sql`insert into entity (opid, kind, parent) values (${variant}, 'variant', ${family})`
	await sql`insert into entity (opid, kind, parent) values (${id}, 'item', ${variant})`
	return id
}

async function childlessVariant(sql: Sql): Promise<string> {
	const family = opid()
	const variant = opid()
	await sql`insert into entity (opid, kind) values (${family}, 'family')`
	await sql`insert into entity (opid, kind, parent) values (${variant}, 'variant', ${family})`
	return variant
}

function mergeRow(from: string, into: string): string {
	return `insert into merge (from_opid, into_opid, reason, decided_by)
          values ('${from}', '${into}', 'race', 'race')`
}

function setMerged(from: string, into: string): string {
	return `update entity set merged_into = '${into}' where opid = '${from}'`
}

async function reset(...sessions: ReservedSql[]): Promise<void> {
	for (const session of sessions) await attempt(session.unsafe('rollback'))
}

interface Tally {
	rejected: number
	deadlocked: number
	bothCommitted: number
}

function tally(): Tally {
	return { rejected: 0, deadlocked: 0, bothCommitted: 0 }
}

function record(counts: Tally, ...outcomes: Outcome[]): void {
	const errors = outcomes.filter((outcome) => outcome !== null)
	counts.rejected += errors.length
	counts.deadlocked += errors.filter(isDeadlock).length
	if (errors.length === 0) counts.bothCommitted++
}

function report(scenario: string, counts: Tally): void {
	console.log(
		`ok    ${scenario}: ${ROUNDS} rounds, ${counts.rejected} rejected, ` +
			`${counts.deadlocked} deadlocked, ${counts.bothCommitted} with both committed`,
	)
}

async function overlappingMerges(
	sql: Sql,
	s1: ReservedSql,
	s2: ReservedSql,
	scenario: string,
	shape: (a: string, b: string, c: string) => [[string, string], [string, string]],
): Promise<Tally> {
	const counts = tally()
	for (let round = 0; round < ROUNDS; round++) {
		const a = await item(sql)
		const b = await item(sql)
		const c = await item(sql)
		const [first, second] = shape(a, b, c)

		await s1.unsafe('begin')
		await s2.unsafe('begin')
		await s1.unsafe(mergeRow(first[0], first[1]))
		await s1.unsafe(setMerged(first[0], first[1]))
		await s2.unsafe(mergeRow(second[0], second[1]))
		await s2.unsafe(setMerged(second[0], second[1]))

		const e1 = attempt(s1.unsafe('commit'))
		const e2 = attempt(s2.unsafe('commit'))
		record(counts, await e1, await e2)

		await reset(s1, s2)
		await audit(sql, scenario, round)
	}
	return counts
}

async function db2(sql: Sql, s1: ReservedSql, s2: ReservedSql, insertFirst: boolean): Promise<Tally> {
	const scenario = insertFirst ? 'DB-2 child inserted first' : 'DB-2 parent re-kinded first'
	const counts = tally()

	for (let round = 0; round < ROUNDS; round++) {
		const victim = await childlessVariant(sql)
		const elsewhere = await childlessVariant(sql)
		const child = opid()
		const insertChild = `insert into entity (opid, kind, parent) values ('${child}', 'item', '${victim}')`
		const reKind = `update entity set kind = 'item', parent = '${elsewhere}' where opid = '${victim}'`

		await s1.unsafe('begin')
		await s2.unsafe('begin')

		let e1: Outcome
		let e2: Outcome
		if (insertFirst) {
			e1 = await attempt(s1.unsafe(insertChild))
			const blocked = attempt(s2.unsafe(reKind))
			e1 = e1 ?? (await attempt(s1.unsafe('commit')))
			e2 = await blocked
			e2 = e2 ?? (await attempt(s2.unsafe('commit')))
		} else {
			e2 = await attempt(s2.unsafe(reKind))
			const blocked = attempt(s1.unsafe(insertChild))
			e2 = e2 ?? (await attempt(s2.unsafe('commit')))
			e1 = await blocked
			e1 = e1 ?? (await attempt(s1.unsafe('commit')))
		}
		record(counts, e1, e2)

		await reset(s1, s2)
		await audit(sql, scenario, round)
	}
	return counts
}

async function db3(sql: Sql, source: string, s1: ReservedSql, s2: ReservedSql, withdrawFirst: boolean): Promise<Tally> {
	const scenario = withdrawFirst ? 'DB-3b withdrawal first' : 'DB-3b claim insert first'
	const counts = tally()

	for (let round = 0; round < ROUNDS; round++) {
		const opidOf = await item(sql)
		const key = `race-${randomBytes(6).toString('hex')}`
		await sql`
      insert into record (source, key, opid, hash, body)
      values (${source}, ${key}, ${opidOf}, ${HASH}, '{}'::jsonb)
    `
		await sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${opidOf}, 'name', '"first"'::jsonb, 'en', ${source}, ${key})
    `

		const withdrawRecord = `update record set withdrawn_at = now() where source = ${source} and key = '${key}'`
		const withdrawClaims = `update claim set withdrawn_at = now()
        where source = ${source} and record_key = '${key}' and withdrawn_at is null`
		const insertClaim = `insert into claim (opid, property, value, lang, source, record_key)
        values ('${opidOf}', 'name', '"second"'::jsonb, 'en', ${source}, '${key}')`

		await s1.unsafe('begin')
		await s2.unsafe('begin')

		let e1: Outcome
		let e2: Outcome
		if (withdrawFirst) {
			e1 = await attempt(s1.unsafe(withdrawRecord))
			e1 = e1 ?? (await attempt(s1.unsafe(withdrawClaims)))
			const blocked = attempt(s2.unsafe(insertClaim))
			e1 = e1 ?? (await attempt(s1.unsafe('commit')))
			e2 = await blocked
			e2 = e2 ?? (await attempt(s2.unsafe('commit')))
		} else {
			e2 = await attempt(s2.unsafe(insertClaim))
			const blocked = attempt(s1.unsafe(withdrawRecord))
			e2 = e2 ?? (await attempt(s2.unsafe('commit')))
			e1 = await blocked
			e1 = e1 ?? (await attempt(s1.unsafe(withdrawClaims)))
			e1 = e1 ?? (await attempt(s1.unsafe('commit')))
		}
		record(counts, e1, e2)

		await reset(s1, s2)
		await audit(sql, scenario, round)
	}
	return counts
}

async function db6(sql: Sql, s1: ReservedSql, s2: ReservedSql): Promise<Tally> {
	const scenario = 'DB-6 log and state written separately'
	const counts = tally()

	for (let round = 0; round < ROUNDS; round++) {
		const a = await item(sql)
		const b = await item(sql)
		const c = await item(sql)

		await s1.unsafe('begin')
		await s2.unsafe('begin')
		await s1.unsafe(mergeRow(a, b))
		await s1.unsafe(setMerged(a, b))
		const blocked = attempt(s2.unsafe(setMerged(a, c)))
		const e1 = await attempt(s1.unsafe('commit'))
		let e2 = await blocked
		e2 = e2 ?? (await attempt(s2.unsafe('commit')))
		record(counts, e1, e2)

		await reset(s1, s2)
		await audit(sql, scenario, round)
	}
	return counts
}

async function sameGroup(sql: Sql, source: string, s1: ReservedSql, s2: ReservedSql): Promise<Tally> {
	const scenario = 'grouping two sessions ingesting one new group'
	const counts = tally()

	for (let round = 0; round < ROUNDS; round++) {
		const key = randomBytes(32).toString('hex')
		const first = opid()
		const second = opid()

		await s1.unsafe('begin')
		await s2.unsafe('begin')
		await s1.unsafe(`insert into entity (opid, kind) values ('${first}', 'family')`)
		await s2.unsafe(`insert into entity (opid, kind) values ('${second}', 'family')`)
		await s1.unsafe(`insert into grouping (source, kind, key, opid) values (${source}, 'family', '${key}', '${first}')`)
		const blocked = attempt(s2.unsafe(`insert into grouping (source, kind, key, opid) values (${source}, 'family', '${key}', '${second}')`))
		const e1 = await attempt(s1.unsafe('commit'))
		let e2 = await blocked
		e2 = e2 ?? (await attempt(s2.unsafe('commit')))
		record(counts, e1, e2)

		await reset(s1, s2)

		const rows = await sql<{ opid: string }[]>`
      select opid from grouping where source = ${source} and kind = 'family' and key = ${key}
    `
		if (rows.length !== 1) fail(scenario, round, `${rows.length} grouping rows for one key`)
		else if (rows[0]?.opid !== first) fail(scenario, round, `the key points at ${rows[0]?.opid}, expected ${first}`)

		const loser = await sql<{ opid: string }[]>`select opid from entity where opid = ${second}`
		if (loser.length !== 0) fail(scenario, round, `the loser left entity ${second} behind`)

		await audit(sql, scenario, round)
	}
	return counts
}

async function mediaCounters(sql: Sql, pool: Sql, source: string): Promise<void> {
	const scenario = 'media failures counted onto one finished crawl'
	let rejected = 0
	const writers = 32

	for (let round = 0; round < ROUNDS; round++) {
		const [crawl] = await sql<{ id: string }[]>`
      insert into crawl (source, via, finished_at, outcome)
      values (${source}, 'dns-txt', now(), 'changed')
      returning id
    `
		if (!crawl) throw new Error('crawl insert returned no row')

		const outcomes = await Promise.all(
			Array.from({ length: writers }, () =>
				attempt(pool.unsafe(`update crawl set media_failed = media_failed + 1 where id = ${crawl.id}`)),
			),
		)
		rejected += outcomes.filter((outcome) => outcome !== null).length

		const [counted] = await sql<{ media_failed: number }[]>`
      select media_failed from crawl where id = ${crawl.id}
    `
		if (counted?.media_failed !== writers) {
			fail(scenario, round, `${writers} increments left media_failed at ${counted?.media_failed}`)
		}

		await audit(sql, scenario, round)
	}
	console.log(`ok    ${scenario}: ${ROUNDS} rounds of ${writers} concurrent increments, ${rejected} rejected, none lost`)
}

function claimDue(limit: number): string {
	return `update source set queued_at = now()
    where id in (
      select id from source
      where (last_crawled_at is null or last_crawled_at <= now() - interval '6 hours')
        and (queued_at is null or queued_at <= now() - interval '15 minutes')
      order by last_crawled_at nulls first, id
      limit ${limit}
      for update skip locked
    )
    returning id`
}

async function claiming(sql: Sql, s1: ReservedSql, s2: ReservedSql): Promise<Tally> {
	const scenario = 'two cron runs claiming due sources'
	const counts = tally()
	const seeded = 6
	const page = 3

	for (let round = 0; round < ROUNDS; round++) {
		await sql`update source set last_crawled_at = now(), queued_at = null`
		for (let n = 0; n < seeded; n++) {
			await sql`insert into source (kind, name) values ('domain', ${`due-${round}-${n}.example`})`
		}

		await s1.unsafe('begin')
		await s2.unsafe('begin')
		const first = await s1.unsafe<{ id: string }[]>(claimDue(page))
		const second = await Promise.race([
			s2.unsafe<{ id: string }[]>(claimDue(page)),
			new Promise<{ id: string }[]>((_, reject) => setTimeout(() => reject(new Error('blocked')), 5000)),
		]).catch((error: Error) => error)

		if (second instanceof Error) {
			fail(scenario, round, `the second claim ${second.message} instead of skipping locked rows`)
			await reset(s1, s2)
			continue
		}

		const e1 = await attempt(s1.unsafe('commit'))
		const e2 = await attempt(s2.unsafe('commit'))
		record(counts, e1, e2)

		const mine = new Set(first.map((row) => row.id))
		const theirs = second.map((row) => row.id)
		const shared = theirs.filter((id) => mine.has(id))
		if (shared.length > 0) fail(scenario, round, `both runs claimed source ${shared[0]}`)
		if (first.length !== page) fail(scenario, round, `the first run claimed ${first.length} of ${page}`)
		if (theirs.length !== page) fail(scenario, round, `the second run claimed ${theirs.length} of ${page}`)

		await reset(s1, s2)
		await audit(sql, scenario, round)
	}
	return counts
}

async function lockRelease(admin: Sql, base: URL): Promise<void> {
	const scenario = 'a failed migration releases the advisory lock'
	const name = `prodid_race_${randomBytes(8).toString('hex')}`
	await admin.unsafe(`create database "${name}"`)
	const target = new URL(base.toString())
	target.pathname = `/${name}`

	const holder = postgres(target.toString(), { max: 1 })
	const other = postgres(target.toString(), { max: 1 })
	const watcher = postgres(target.toString(), { max: 1 })
	try {
		await holder.unsafe('create table source (blocker int)')

		const broken = await attempt(migrate(holder))
		if (!broken) {
			fail(scenario, 0, 'the migration was expected to fail and did not')
			return
		}

		const [locks] = await watcher<{ n: number }[]>`
      select count(*)::int as n from pg_locks
      where locktype = 'advisory'
        and database = (select oid from pg_database where datname = current_database())
    `
		if (locks?.n !== 0) fail(scenario, 0, `${locks?.n} advisory locks still held after the failure`)

		const started = Date.now()
		const second = await Promise.race([
			attempt(migrate(other)),
			new Promise<Outcome>((resolve) => setTimeout(() => resolve(new Error('hung')), 5000)),
		])
		const took = Date.now() - started

		if (second === null) fail(scenario, 0, 'the second run unexpectedly succeeded')
		else if (second.message === 'hung') fail(scenario, 0, 'the second run hung on a leaked lock')
		else console.log(`ok    ${scenario}: a second run on another pool failed in ${took} ms instead of hanging`)
	} finally {
		// timeout 0: when this test fails, one migration is still stuck on the leaked lock and a
		// graceful end would wait for it, turning a failure into a hang
		await Promise.all([holder, other, watcher].map((client) => client.end({ timeout: 0 })))
		await admin.unsafe(`drop database if exists "${name}" with (force)`)
	}
}

async function db10(admin: Sql, base: URL): Promise<void> {
	const scenario = 'DB-10 concurrent migrations'
	let applied = 0

	for (let round = 0; round < 5; round++) {
		const name = `prodid_race_${randomBytes(8).toString('hex')}`
		await admin.unsafe(`create database "${name}"`)
		const target = new URL(base.toString())
		target.pathname = `/${name}`
		const clients = Array.from({ length: 4 }, () => postgres(target.toString(), { max: 1 }))
		try {
			const results = await Promise.allSettled(clients.map((client) => migrate(client)))
			for (const result of results) {
				if (result.status === 'rejected') {
					fail(scenario, round, `a migration died: ${String(result.reason)}`)
					continue
				}
				if (result.value.length > 0) applied++
			}
		} finally {
			await Promise.all(clients.map((client) => client.end()))
			await admin.unsafe(`drop database if exists "${name}" with (force)`)
		}
	}

	if (applied !== 5) fail(scenario, 0, `${applied} runs applied the migration, expected 5`)
	console.log(`ok    ${scenario}: 5 databases, 4 concurrent runs each, ${applied} applied and the rest found nothing to do`)
}

const url = process.env.DATABASE_URL
if (!url) {
	console.error('DATABASE_URL is not set')
	process.exit(1)
}

const name = `prodid_race_${randomBytes(8).toString('hex')}`
const target = new URL(url)
target.pathname = `/${name}`

const admin = postgres(url, { max: 1 })
await admin.unsafe(`create database "${name}"`)
console.log(`created ${name}`)

try {
	const sql = postgres(target.toString(), { max: 4 })
	const many = postgres(target.toString(), { max: 8 })
	const one = postgres(target.toString(), { max: 1, onnotice: () => {} })
	const two = postgres(target.toString(), { max: 1, onnotice: () => {} })
	try {
		await migrate(sql)
		const [source] = await sql<{ id: string }[]>`
      insert into source (kind, name) values ('domain', 'race.example') returning id
    `
		if (!source) throw new Error('source insert returned no row')

		const s1 = await one.reserve()
		const s2 = await two.reserve()
		try {
			report(
				'DB-1 a→b ‖ b→c',
				await overlappingMerges(sql, s1, s2, 'DB-1 a→b ‖ b→c', (a, b, c) => [
					[a, b],
					[b, c],
				]),
			)
			report(
				'DB-1 a→b ‖ c→a',
				await overlappingMerges(sql, s1, s2, 'DB-1 a→b ‖ c→a', (a, b, c) => [
					[a, b],
					[c, a],
				]),
			)

			const legal = await overlappingMerges(sql, s1, s2, 'DB-1 legal a→c ‖ b→c', (a, b, c) => [
				[a, c],
				[b, c],
			])
			if (legal.bothCommitted !== ROUNDS) {
				fail('DB-1 legal a→c ‖ b→c', 0, `only ${legal.bothCommitted} of ${ROUNDS} rounds let both commit`)
			}
			report('DB-1 legal a→c ‖ b→c', legal)

			report('DB-2 child inserted first', await db2(sql, s1, s2, true))
			report('DB-2 parent re-kinded first', await db2(sql, s1, s2, false))
			report('DB-3b withdrawal first', await db3(sql, source.id, s1, s2, true))
			report('DB-3b claim insert first', await db3(sql, source.id, s1, s2, false))
			report('DB-6 log and state written separately', await db6(sql, s1, s2))
			report('grouping two sessions ingesting one new group', await sameGroup(sql, source.id, s1, s2))
			report('two cron runs claiming due sources', await claiming(sql, s1, s2))
			await mediaCounters(sql, many, source.id)
		} finally {
			s1.release()
			s2.release()
		}
	} finally {
		await Promise.all([sql.end(), many.end(), one.end(), two.end()])
	}

	await lockRelease(admin, new URL(url))
	await db10(admin, new URL(url))
} finally {
	await admin.unsafe(`drop database if exists "${name}" with (force)`)
	await admin.end()
	console.log(`dropped ${name}`)
}

console.log(failures ? `\n${failures} failed` : '\nall good')
process.exit(failures ? 1 : 0)

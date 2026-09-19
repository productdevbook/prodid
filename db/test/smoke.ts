import { randomBytes } from 'node:crypto'

import postgres, { type Sql } from 'postgres'

import { migrate } from '../migrate'

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

let failures = 0

function pass(label: string): void {
	console.log(`ok    ${label}`)
}

function fail(label: string, detail: unknown): void {
	failures++
	console.log(`FAIL  ${label} — ${detail}`)
}

async function accepts(label: string, run: () => Promise<unknown>): Promise<void> {
	try {
		await run()
		pass(label)
	} catch (error) {
		fail(label, error instanceof Error ? error.message : error)
	}
}

async function rejects(label: string, run: () => Promise<unknown>): Promise<void> {
	try {
		await run()
		fail(label, 'statement succeeded, expected a constraint violation')
	} catch {
		pass(label)
	}
}

function equals(label: string, actual: unknown, expected: unknown): void {
	if (actual === expected) pass(label)
	else fail(label, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}

interface Chain {
	family: string
	variant: string
	item: string
}

async function chain(sql: Sql): Promise<Chain> {
	const family = opid()
	const variant = opid()
	const item = opid()
	await sql`insert into entity (opid, kind) values (${family}, 'family')`
	await sql`insert into entity (opid, kind, parent) values (${variant}, 'variant', ${family})`
	await sql`insert into entity (opid, kind, parent) values (${item}, 'item', ${variant})`
	return { family, variant, item }
}

async function sources(sql: Sql): Promise<string> {
	const [source] = await sql<{ id: string }[]>`
    insert into source (kind, name) values ('domain', 'acme.example') returning id
  `
	if (!source) throw new Error('source insert returned no row')
	pass('source inserts')

	await rejects(
		'source kind outside the value set is rejected',
		() => sql`insert into source (kind, name) values ('robot', 'robot.example')`,
	)

	await rejects(
		'source trust outside the value set is rejected',
		() => sql`insert into source (kind, name, trust) values ('domain', 'trust.example', 'pretty-sure')`,
	)

	await rejects(
		'trust above unverified with no proof at all is rejected',
		() => sql`insert into source (kind, name, trust) values ('domain', 'evil.example', 'verified')`,
	)

	await rejects(
		'trust above unverified with a half-built proof is rejected',
		() => sql`
      insert into source (kind, name, trust, verified_by, verified_at)
      values ('domain', 'half.example', 'verified', 'dns-txt', now())
    `,
	)

	return source.id
}

async function feeds(sql: Sql, source: string): Promise<void> {
	await accepts(
		'feed inserts',
		() => sql`
      insert into feed (source, url, etag, last_modified, last_fetched_at, last_status)
      values (${source}, 'https://acme.example/.well-known/prodid.json', 'W/"1"', 'Wed, 17 Sep 2026 10:00:00 GMT', now(), 200)
    `,
	)

	await rejects(
		'duplicate (source, url) is rejected',
		() => sql`
      insert into feed (source, url) values (${source}, 'https://acme.example/.well-known/prodid.json')
    `,
	)

	await accepts(
		'a second url for the same source is accepted',
		() => sql`insert into feed (source, url) values (${source}, 'https://acme.example/feed.ndjson')`,
	)

	await rejects(
		'a feed url that is not https is rejected',
		() => sql`insert into feed (source, url) values (${source}, 'http://acme.example/feed.ndjson')`,
	)

	await accepts('a run of skipped lines is recorded and cleared', async () => {
		await sql`
      update feed set skipping_since = now() - interval '8 days'
      where source = ${source} and url = 'https://acme.example/feed.ndjson'
    `
		const [skipping] = await sql<{ days: number }[]>`
      select extract(day from now() - skipping_since)::int as days
      from feed where source = ${source} and url = 'https://acme.example/feed.ndjson'
    `
		if (skipping?.days !== 8) throw new Error(`skipping_since reads back as ${skipping?.days} days`)
		await sql`
      update feed set skipping_since = null
      where source = ${source} and url = 'https://acme.example/feed.ndjson'
    `
	})
}

async function crawls(sql: Sql, source: string): Promise<string> {
	await accepts(
		'an unfinished crawl inserts',
		() => sql`
      insert into crawl (source, via, document_url)
      values (${source}, 'well-known', 'https://acme.example/.well-known/prodid.json')
    `,
	)

	const [proof] = await sql<{ id: string }[]>`
    insert into crawl (source, via, document_url, finished_at, outcome, http_status, records_seen, records_changed, lines_skipped)
    values (${source}, 'dns-txt', 'https://host.example/.well-known/prodid.json', now(), 'changed', 200, 12, 3, 2)
    returning id
  `
	if (!proof) throw new Error('crawl insert returned no row')
	pass('a finished crawl inserts')

	await rejects(
		'a negative lines_skipped is rejected',
		() => sql`
      insert into crawl (source, via, finished_at, outcome, lines_skipped)
      values (${source}, 'dns-txt', now(), 'changed', -1)
    `,
	)

	await accepts(
		'a crawl that found no discovery path inserts without a via',
		() => sql`
      insert into crawl (source, finished_at, outcome, error)
      values (${source}, now(), 'no-discovery', 'no .well-known and no _prodid TXT')
    `,
	)

	await rejects(
		'crawl via outside the value set is rejected',
		() => sql`insert into crawl (source, via) values (${source}, 'carrier-pigeon')`,
	)

	await rejects(
		'crawl outcome outside the value set is rejected',
		() => sql`insert into crawl (source, finished_at, outcome) values (${source}, now(), 'sort-of-worked')`,
	)

	await rejects(
		'a finished crawl without an outcome is rejected',
		() => sql`insert into crawl (source, via, finished_at) values (${source}, 'well-known', now())`,
	)

	await rejects(
		'an unfinished crawl with an outcome is rejected',
		() => sql`insert into crawl (source, via, outcome) values (${source}, 'well-known', 'changed')`,
	)

	return proof.id
}

async function verification(sql: Sql, source: string, proof: string): Promise<void> {
	const [other] = await sql<{ id: string }[]>`
    insert into source (kind, name) values ('domain', 'other.example') returning id
  `
	if (!other) throw new Error('source insert returned no row')

	const [foreign_] = await sql<{ id: string }[]>`
    insert into crawl (source, via, finished_at, outcome) values (${other.id}, 'dns-txt', now(), 'changed')
    returning id
  `
	const [failed] = await sql<{ id: string }[]>`
    insert into crawl (source, via, finished_at, outcome) values (${source}, 'dns-txt', now(), 'fetch-failed')
    returning id
  `
	const [running] = await sql<{ id: string }[]>`
    insert into crawl (source, via) values (${source}, 'dns-txt') returning id
  `
	if (!foreign_ || !failed || !running) throw new Error('crawl insert returned no row')

	await rejects(
		'a proving crawl belonging to another source is rejected',
		() => sql`
      update source set trust = 'verified', verified_by = 'dns-txt', verified_at = now(), verified_crawl = ${foreign_.id}
      where id = ${source}
    `,
	)

	await rejects(
		'a failed crawl cannot be the proof',
		() => sql`
      update source set trust = 'verified', verified_by = 'dns-txt', verified_at = now(), verified_crawl = ${failed.id}
      where id = ${source}
    `,
	)

	await rejects(
		'an unfinished crawl cannot be the proof',
		() => sql`
      update source set trust = 'verified', verified_by = 'dns-txt', verified_at = now(), verified_crawl = ${running.id}
      where id = ${source}
    `,
	)

	await accepts(
		'a source is verified by pointing at the crawl that proved it',
		() => sql`
      update source
      set trust = 'verified', verified_by = 'dns-txt', verified_at = now(), verified_crawl = ${proof}
      where id = ${source}
    `,
	)

	await rejects('the proving crawl cannot be demoted afterwards', () => sql`update crawl set outcome = 'fetch-failed' where id = ${proof}`)

	await rejects(
		'source verified_by outside the value set is rejected',
		() => sql`update source set verified_by = 'carrier-pigeon' where id = ${source}`,
	)

	await rejects(
		'a proving crawl cannot be kept without the verification it proved',
		() => sql`update source set verified_by = null, verified_at = null where id = ${source}`,
	)

	await rejects(
		'a verified source cannot be demoted to unverified while keeping its proof',
		() => sql`update source set trust = 'unverified' where id = ${source}`,
	)

	await accepts('a lapse is recorded and cleared', async () => {
		await sql`update source set lapsed_at = now() - interval '31 days' where id = ${source}`
		await sql`update source set lapsed_at = null where id = ${source}`
	})

	await sql`update source set failing_since = now() - interval '8 days' where id = ${source}`
	const [due] = await sql<{ id: string }[]>`
    select id from source where failing_since < now() - interval '7 days' and lapsed_at is null
  `
	equals('a source failing for more than seven days is found', due?.id, source)

	await sql`update source set lapsed_at = now() where id = ${source}`
	const [gone] = await sql<{ id: string }[]>`
    select id from source where failing_since < now() - interval '7 days' and lapsed_at is null
  `
	equals('a source that has already lapsed is not found again', gone?.id, undefined)

	await sql`update source set lapsed_at = null, failing_since = null where id = ${source}`
}

async function hierarchy(sql: Sql): Promise<Chain> {
	const built = await chain(sql)
	pass('item → variant → family chain inserts')

	const [walk] = await sql<{ parent_kind: string; grandparent_kind: string }[]>`
    select p.kind as parent_kind, g.kind as grandparent_kind
    from entity e
    join entity p on p.opid = e.parent
    join entity g on g.opid = p.parent
    where e.opid = ${built.item}
  `
	equals('item walks up to a variant', walk?.parent_kind, 'variant')
	equals('variant walks up to a family', walk?.grandparent_kind, 'family')

	await rejects('malformed opid is rejected', () => sql`insert into entity (opid, kind) values ('fam000000000000l', 'family')`)

	await rejects('entity kind outside the value set is rejected', () => sql`insert into entity (opid, kind) values (${opid()}, 'bundle')`)

	await rejects('entity parent must exist', () => sql`insert into entity (opid, kind, parent) values (${opid()}, 'item', ${opid()})`)

	await rejects(
		'a family with a parent is rejected',
		() => sql`insert into entity (opid, kind, parent) values (${opid()}, 'family', ${built.family})`,
	)

	await rejects('a variant with no parent is rejected', () => sql`insert into entity (opid, kind) values (${opid()}, 'variant')`)

	await rejects(
		'a variant parented to a variant is rejected',
		() => sql`insert into entity (opid, kind, parent) values (${opid()}, 'variant', ${built.variant})`,
	)

	await rejects(
		'a variant parented to an item is rejected',
		() => sql`insert into entity (opid, kind, parent) values (${opid()}, 'variant', ${built.item})`,
	)

	await rejects('an item with no parent is rejected', () => sql`insert into entity (opid, kind) values (${opid()}, 'item')`)

	await rejects(
		'an item parented to a family is rejected',
		() => sql`insert into entity (opid, kind, parent) values (${opid()}, 'item', ${built.family})`,
	)

	await rejects(
		'an item parented to an item is rejected',
		() => sql`insert into entity (opid, kind, parent) values (${opid()}, 'item', ${built.item})`,
	)

	await rejects(
		'an item cannot be re-parented to a family',
		() => sql`update entity set parent = ${built.family} where opid = ${built.item}`,
	)

	const other = await chain(sql)
	await accepts(
		'an item can be re-parented to another variant',
		() => sql`update entity set parent = ${other.variant} where opid = ${built.item}`,
	)
	await sql`update entity set parent = ${built.variant} where opid = ${built.item}`

	await rejects(
		'the kind of an entity with children cannot change',
		() => sql`update entity set kind = 'variant' where opid = ${built.family}`,
	)

	return built
}

async function identifiers(sql: Sql, source: string, built: Chain): Promise<void> {
	await accepts(
		'identifier inserts',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('gtin', '', '00012345678905', ${built.item}, ${source})
    `,
	)

	await rejects(
		'duplicate (scheme, scope, value) is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('gtin', '', '00012345678905', ${built.variant}, ${source})
    `,
	)

	await rejects(
		'a global scheme under a non-empty scope is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('gtin', 'acme', '00012345678905', ${built.variant}, ${source})
    `,
	)

	await accepts(
		'an mpn is scoped to its brand',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('mpn', 'acme', 'TRAIL-NAVY-M', ${built.item}, ${source})
    `,
	)

	await rejects(
		'an mpn with no brand scope is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('mpn', '', 'TRAIL-NAVY-L', ${built.item}, ${source})
    `,
	)

	await accepts(
		'a sku is scoped to the source id',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('sku', ${source}, '00012345678905', ${built.item}, ${source})
    `,
	)

	await rejects(
		'a sku scoped to a source name is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('sku', 'acme.example', 'TRAIL-NAVY-S', ${built.item}, ${source})
    `,
	)

	await accepts(
		'an rcn is scoped to the source id like a sku',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('rcn', ${source}, '02000000000017', ${built.item}, ${source})
    `,
	)

	await rejects(
		'an rcn with no source scope is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('rcn', '', '02000000000024', ${built.item}, ${source})
    `,
	)

	await rejects(
		'an unpadded gtin is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('gtin', '', '12345678905', ${built.item}, ${source})
    `,
	)

	await rejects(
		'the all-zero gtin is rejected',
		() => sql`
      insert into identifier (scheme, scope, value, opid, first_source)
      values ('gtin', '', '00000000000000', ${built.item}, ${source})
    `,
	)
}

async function records(sql: Sql, source: string, built: Chain): Promise<string> {
	const key = 'jacket-navy-m'

	await accepts(
		'record inserts',
		() => sql`
      insert into record (source, key, opid, hash, body)
      values (${source}, ${key}, ${built.item}, ${HASH}, ${sql.json({ $type: 'org.prodid.item', key })})
    `,
	)

	await rejects(
		'duplicate (source, key) is rejected',
		() => sql`
      insert into record (source, key, opid, hash, body)
      values (${source}, ${key}, ${built.variant}, ${HASH}, '{}'::jsonb)
    `,
	)

	return key
}

async function claims(sql: Sql, source: string, built: Chain, key: string): Promise<void> {
	const [claim] = await sql<{ id: string }[]>`
    insert into claim (opid, property, value, lang, source, record_key)
    values (${built.item}, 'name', ${sql.json('Acme Trail Jacket')}, 'en', ${source}, ${key})
    returning id
  `
	if (!claim) throw new Error('claim insert returned no row')
	pass('claim inserts')

	await rejects(
		'a claim pointing at a record that does not exist is rejected',
		() => sql`
      insert into claim (opid, property, value, source, record_key)
      values (${built.item}, 'name', '"x"'::jsonb, ${source}, 'no-such-key')
    `,
	)

	await rejects(
		'inserting the same active claim twice is rejected',
		() => sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'name', ${sql.json('Acme Trail Jacket')}, 'en', ${source}, ${key})
    `,
	)

	await accepts(
		'a claim differing only in value is accepted',
		() => sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'name', ${sql.json('Acme Trail Jacket II')}, 'en', ${source}, ${key})
    `,
	)

	await accepts(
		'a claim differing only in lang is accepted',
		() => sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'name', ${sql.json('Acme Trail Jacket')}, 'de', ${source}, ${key})
    `,
	)

	await accepts(
		'a claim with no record and no lang is accepted',
		() => sql`
      insert into claim (opid, property, value, source)
      values (${built.item}, 'derivedBrand', ${sql.json('Acme')}, ${source})
    `,
	)

	await rejects(
		'null record_key and null lang still collide',
		() => sql`
      insert into claim (opid, property, value, source)
      values (${built.item}, 'derivedBrand', ${sql.json('Acme')}, ${source})
    `,
	)

	const long = 'x'.repeat(3200)
	await accepts('two claims differing only in a long value are both accepted', async () => {
		await sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'description', ${sql.json(`${long}a`)}, 'en', ${source}, ${key})
    `
		await sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'description', ${sql.json(`${long}b`)}, 'en', ${source}, ${key})
    `
	})

	const before = await sql`select id from claim where opid = ${built.item} and property = 'name' and withdrawn_at is null`
	equals('three name claims are active', before.length, 3)

	await sql`update claim set withdrawn_at = now() where id = ${claim.id}`
	const after = await sql`select id from claim where opid = ${built.item} and property = 'name' and withdrawn_at is null`
	equals('the claim can be withdrawn', after.length, 2)

	await accepts(
		'the same claim is accepted again once the first is withdrawn',
		() => sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'name', ${sql.json('Acme Trail Jacket')}, 'en', ${source}, ${key})
    `,
	)
}

async function withdrawal(sql: Sql, source: string, built: Chain): Promise<void> {
	const key = 'jacket-black-l'
	await sql`
    insert into record (source, key, opid, hash, body)
    values (${source}, ${key}, ${built.item}, ${HASH}, ${sql.json({ $type: 'org.prodid.item', key })})
  `
	const [claim] = await sql<{ id: string }[]>`
    insert into claim (opid, property, value, lang, source, record_key)
    values (${built.item}, 'name', ${sql.json('Acme Trail Jacket, black L')}, 'en', ${source}, ${key})
    returning id
  `
	if (!claim) throw new Error('claim insert returned no row')

	await rejects(
		'withdrawing a record while its claims are active is rejected',
		() => sql`update record set withdrawn_at = now() where source = ${source} and key = ${key}`,
	)

	await accepts('a record and its claims are withdrawn in one transaction', () =>
		sql.begin(async (tx) => {
			await tx`update record set withdrawn_at = now() where source = ${source} and key = ${key}`
			await tx`
        update claim set withdrawn_at = now()
        where source = ${source} and record_key = ${key} and withdrawn_at is null
      `
		}),
	)

	await rejects(
		'an active claim cannot be written under a withdrawn record',
		() => sql`
      insert into claim (opid, property, value, lang, source, record_key)
      values (${built.item}, 'name', ${sql.json('back from the dead')}, 'en', ${source}, ${key})
    `,
	)

	await rejects(
		'a withdrawn claim under a withdrawn record cannot be revived',
		() => sql`update claim set withdrawn_at = null where id = ${claim.id}`,
	)

	await accepts('a key that comes back clears withdrawn_at and inserts fresh claims', () =>
		sql.begin(async (tx) => {
			await tx`update record set withdrawn_at = null where source = ${source} and key = ${key}`
			await tx`
        insert into claim (opid, property, value, lang, source, record_key)
        values (${built.item}, 'name', ${sql.json('Acme Trail Jacket, black L')}, 'en', ${source}, ${key})
      `
		}),
	)
}

async function upgrade(sql: Sql, built: Chain): Promise<void> {
	const [slug] = await sql<{ id: string }[]>`
    insert into source (kind, name) values ('hosted', 'acme.prodid.org') returning id
  `
	if (!slug) throw new Error('source insert returned no row')

	await sql`
    insert into identifier (scheme, scope, value, opid, first_source)
    values ('sku', ${slug.id}, 'TRAIL-NAVY-M', ${built.item}, ${slug.id})
  `

	const [proof] = await sql<{ id: string }[]>`
    insert into crawl (source, via, document_url, finished_at, outcome, http_status)
    values (${slug.id}, 'dns-txt', 'https://acme.prodid.org/.well-known/prodid.json', now(), 'changed', 200)
    returning id
  `
	if (!proof) throw new Error('crawl insert returned no row')

	await accepts(
		'a slug-hosted source becomes a verified domain in one statement',
		() => sql`
      update source set
        name = 'acme-tools.example',
        kind = 'domain',
        trust = 'verified',
        verified_by = 'dns-txt',
        verified_at = now(),
        verified_crawl = ${proof.id},
        feed_host = 'acme.prodid.org',
        lapsed_at = null
      where id = ${slug.id}
    `,
	)

	const [kept] = await sql<{ scope: string; opid: string }[]>`
    select scope, opid from identifier where scheme = 'sku' and value = 'TRAIL-NAVY-M'
  `
	equals('the sku scope still names the source id', kept?.scope, slug.id)
	equals('the sku still resolves to the same opid', kept?.opid, built.item)
}

function merged(sql: Sql, from: string, into: string, reason: string): Promise<unknown> {
	return sql.begin(async (tx) => {
		await tx`
      insert into merge (from_opid, into_opid, reason, decided_by)
      values (${from}, ${into}, ${reason}, 'resolution-pass-0')
    `
		await tx`update entity set merged_into = ${into} where opid = ${from}`
	})
}

async function merges(sql: Sql): Promise<void> {
	const a = (await chain(sql)).item
	const b = (await chain(sql)).item
	const c = (await chain(sql)).item
	const d = (await chain(sql)).item
	const e = (await chain(sql)).item

	await accepts('a merge writes the log and the state in one transaction', () => merged(sql, a, b, 'same gtin'))

	const [state] = await sql<{ merged_into: string | null }[]>`select merged_into from entity where opid = ${a}`
	equals('merged_into is set', state?.merged_into, b)

	await rejects(
		'a merge into itself is rejected',
		() => sql`insert into merge (from_opid, into_opid, reason, decided_by) values (${c}, ${c}, 'x', 'y')`,
	)

	await rejects('an entity cannot be merged into itself', () => sql`update entity set merged_into = ${c} where opid = ${c}`)

	await rejects('setting merged_into with no merge row is rejected', () => sql`update entity set merged_into = ${c} where opid = ${d}`)

	await rejects(
		'a merge row with no matching state is rejected',
		() => sql`insert into merge (from_opid, into_opid, reason, decided_by) values (${d}, ${c}, 'x', 'y')`,
	)

	await rejects('a merge row that disagrees with the state is rejected', () =>
		sql.begin(async (tx) => {
			await tx`insert into merge (from_opid, into_opid, reason, decided_by) values (${d}, ${c}, 'x', 'y')`
			await tx`update entity set merged_into = ${e} where opid = ${d}`
		}),
	)

	await rejects(
		'a second un-reverted merge from the same opid is rejected',
		() => sql`insert into merge (from_opid, into_opid, reason, decided_by) values (${a}, ${c}, 'again', 'y')`,
	)

	await rejects('merging a survivor while something is merged into it is rejected', () => merged(sql, b, c, 'same gtin'))

	await accepts('merging a survivor is accepted when the repoint is in the same transaction', () =>
		sql.begin(async (tx) => {
			await tx`update merge set reverted_at = now() where from_opid = ${a} and reverted_at is null`
			await tx`
        insert into merge (from_opid, into_opid, reason, decided_by)
        values (${a}, ${c}, 'repointed', 'resolution-pass-0'), (${b}, ${c}, 'same gtin', 'resolution-pass-0')
      `
			await tx`update entity set merged_into = ${c} where opid in (${a}, ${b})`
		}),
	)

	await rejects('merging into an entity that is itself merged is rejected', () => merged(sql, d, a, 'chain'))

	await accepts('a merge reverts', () =>
		sql.begin(async (tx) => {
			await tx`update merge set reverted_at = now() where from_opid = ${a} and reverted_at is null`
			await tx`update entity set merged_into = null where opid = ${a}`
		}),
	)

	const [reverted] = await sql<{ merged_into: string | null }[]>`select merged_into from entity where opid = ${a}`
	equals('merged_into is cleared by the revert', reverted?.merged_into, null)

	await rejects(
		'reverting the log without clearing the state is rejected',
		() => sql`update merge set reverted_at = now() where from_opid = ${b} and reverted_at is null`,
	)

	await rejects(
		'clearing the state without reverting the log is rejected',
		() => sql`update entity set merged_into = null where opid = ${b}`,
	)

	await accepts('a new merge from the same opid is accepted after the revert', () => merged(sql, a, d, 'new decision'))
}

async function run(sql: Sql): Promise<void> {
	const source = await sources(sql)
	await feeds(sql, source)
	const proof = await crawls(sql, source)
	await verification(sql, source, proof)
	const built = await hierarchy(sql)
	await identifiers(sql, source, built)
	const key = await records(sql, source, built)
	await claims(sql, source, built, key)
	await withdrawal(sql, source, built)
	await upgrade(sql, built)
	await merges(sql)
}

const url = process.env.DATABASE_URL
if (!url) {
	console.error('DATABASE_URL is not set')
	process.exit(1)
}

const name = `prodid_smoke_${randomBytes(8).toString('hex')}`
const target = new URL(url)
target.pathname = `/${name}`

const admin = postgres(url, { max: 1 })
await admin.unsafe(`create database "${name}"`)
console.log(`created ${name}`)

try {
	const sql = postgres(target.toString(), { max: 1 })
	try {
		const applied = await migrate(sql)
		console.log(`applied ${applied.join(', ')}`)
		await run(sql)
	} finally {
		await sql.end()
	}
} finally {
	await admin.unsafe(`drop database if exists "${name}" with (force)`)
	await admin.end()
	console.log(`dropped ${name}`)
}

console.log(failures ? `\n${failures} failed` : '\nall good')
process.exit(failures ? 1 : 0)

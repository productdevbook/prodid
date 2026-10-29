import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { type EntityRecord, type SourceRecord, validateEntity, validateSource } from '@prodid/core'
import { databaseReachable } from '@prodid/store/testing'

import { document, GTINS, item, JACKET } from './support/fixtures'
import { type Edge, json, startEdge } from './support/harness'

const reachable = await databaseReachable()
if (!reachable) console.log('skipping: no Postgres at DATABASE_URL — run `bun run --filter @prodid/db up` first')

const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001

function acme(feedLines: readonly unknown[], options: { etag?: string } = {}): Edge {
	const at = edge!
	at.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
	at.net.feed('https://acme.example/items.ndjson', feedLines, options)
	return at
}

async function ping(at: Edge, domain: string): Promise<Response> {
	return await at.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain }) })
}

async function entityFor(at: Edge, gtin: string, query = ''): Promise<EntityRecord> {
	const response = await at.fetch(`/01/${gtin}${query}`)
	expect(response.status).toBe(200)
	const body = await json<EntityRecord>(response)
	const valid = validateEntity(body)
	if (!valid.ok) throw new Error(`entity is not valid: ${JSON.stringify(valid.errors)}`)
	return body
}

function claimValues(entity: EntityRecord, property: string, includeWithdrawn = false): string[] {
	return entity.claims
		.filter((claim) => claim.property === property && (includeWithdrawn || claim.withdrawn_at === undefined))
		.map((claim) => JSON.stringify(claim.value))
}

describe.skipIf(!reachable)('a domain that publishes its own document', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('ping, crawl, and the GTIN resolves to an item with parents and sourced claims', async () => {
		const at = acme([JACKET.navy, JACKET.black, JACKET.olive])

		const accepted = await ping(at, 'acme.example')
		expect(accepted.status).toBe(202)
		expect(accepted.headers.get('cache-control')).toBe('no-store')
		expect(await json<{ status: string }>(accepted)).toEqual({ status: 'accepted' })

		await at.drain()

		const entity = await entityFor(at, GTINS.navy)
		expect(entity.kind).toBe('item')
		expect(entity.parents?.family).toMatch(/^[0-9a-hjkmnp-tv-z]{16}$/)
		expect(entity.parents?.variant).toMatch(/^[0-9a-hjkmnp-tv-z]{16}$/)
		expect(entity.identifiers).toContainEqual({ scheme: 'gtin', value: GTINS.navy.padStart(14, '0') })
		expect(entity.identifiers).toContainEqual({ scheme: 'sku', value: 'TJ-NV-M', scope: 'acme.example' })
		expect(claimValues(entity, 'name')).toEqual(['"Trail Jacket"'])
		expect(claimValues(entity, 'variant.color')).toEqual(['"Navy"'])
		for (const claim of entity.claims) {
			expect(claim.source).toEqual({ name: 'acme.example', trust: 'verified', lapsed: false })
		}

		const response = await at.fetch(`/01/${GTINS.navy}`)
		expect(response.headers.get('content-location')).toBe(`/id/${entity.opid}`)

		// The three variants share one family and each has its own variant.
		const black = await entityFor(at, GTINS.black)
		expect(black.parents?.family).toBe(entity.parents!.family!)
		expect(black.parents?.variant).not.toBe(entity.parents!.variant!)

		const family = await json<EntityRecord>(await at.fetch(`/id/${entity.parents!.family!}`))
		expect(validateEntity(family).ok).toBe(true)
		expect(family.children).toHaveLength(3)
	})

	test('the source status is valid and says verified by well-known', async () => {
		acme([JACKET.navy])
		await edge!.crawl('acme.example')

		const response = await edge!.fetch('/source/acme.example')
		expect(response.status).toBe(200)
		const status = await json<SourceRecord>(response)
		const valid = validateSource(status)
		if (!valid.ok) throw new Error(`source is not valid: ${JSON.stringify(valid.errors)}`)
		expect(status.kind).toBe('domain')
		expect(status.trust).toBe('verified')
		expect(status.verified_by).toBe('well-known')
		expect(status.lapsed).toBe(false)
		expect(status.license).toBe('CC0-1.0')
		expect(status.last_crawl?.outcome).toBe('success')
		expect(status.last_crawl?.via).toBe('well-known')
		expect(status.last_crawl?.http_status).toBe(200)
		expect(status.last_crawl?.records_seen).toBe(1)
	})

	test('an unchanged re-crawl is unchanged and every seen_at survives it', async () => {
		acme([JACKET.navy, JACKET.black])
		await edge!.crawl('acme.example')
		const before = await entityFor(edge!, GTINS.navy)

		edge!.clock.advance(TEN_MINUTES)
		const again = await edge!.crawl('acme.example')
		expect(again).toMatchObject({ kind: 'done', outcome: 'unchanged' })

		const after = await entityFor(edge!, GTINS.navy)
		expect(after.opid).toBe(before.opid)
		expect(after.claims.map((claim) => [claim.property, claim.seen_at])).toEqual(
			before.claims.map((claim) => [claim.property, claim.seen_at]),
		)
	})

	test('a changed value withdraws exactly one claim and inserts exactly one', async () => {
		acme([JACKET.navy])
		await edge!.crawl('acme.example')
		const before = await entityFor(edge!, GTINS.navy)
		const brandSeenAt = before.claims.find((claim) => claim.property === 'brand')!.seen_at

		edge!.clock.advance(TEN_MINUTES)
		acme([
			item({
				key: 'tj-navy-m',
				name: 'Trail Jacket II',
				group: 'trail-jacket',
				variant: { color: 'Navy', size: 'M' },
				gtin: GTINS.navy,
				sku: 'TJ-NV-M',
			}),
		])
		const result = await edge!.crawl('acme.example')
		expect(result).toMatchObject({ kind: 'done', outcome: 'changed' })

		const after = await entityFor(edge!, GTINS.navy, '?history=1')
		expect(after.opid).toBe(before.opid)
		expect(claimValues(after, 'name')).toEqual(['"Trail Jacket II"'])
		const withdrawn = after.claims.filter((claim) => claim.withdrawn_at !== undefined)
		expect(withdrawn).toHaveLength(1)
		expect(withdrawn[0]!.value).toBe('Trail Jacket')
		// Everything still asserted keeps the moment it was first asserted.
		expect(after.claims.find((claim) => claim.property === 'brand')!.seen_at).toBe(brandSeenAt)
	})

	test('a removed key withdraws the record and its claims together', async () => {
		acme([JACKET.navy, JACKET.black])
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		acme([JACKET.navy])
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })

		const gone = await edge!.fetch(`/01/${GTINS.black}`)
		expect(gone.status).toBe(200)
		const entity = await json<EntityRecord>(gone)
		expect(entity.claims).toHaveLength(0)

		const withdrawn = await edge!.sql<{ withdrawn_at: Date | null }[]>`
			select withdrawn_at from record where key = 'tj-black-m'
		`
		expect(withdrawn[0]?.withdrawn_at).not.toBeNull()
		const claims = await edge!.sql<{ withdrawn_at: Date | null }[]>`
			select withdrawn_at from claim where record_key = 'tj-black-m'
		`
		expect(claims.length).toBeGreaterThan(0)
		for (const claim of claims) expect(claim.withdrawn_at).toEqual(withdrawn[0]!.withdrawn_at!)
	})

	test('a bad line is skipped, the rest is ingested, and nothing is withdrawn for seven days', async () => {
		acme([JACKET.navy, JACKET.black])
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		// `tj-black-m` is gone and one line is unparseable, so its key is unknown.
		acme([JACKET.navy, '{ not json'])
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'unchanged' })

		const status = await json<SourceRecord>(await edge!.fetch('/source/acme.example'))
		expect(status.last_crawl?.lines_skipped).toBe(1)
		expect(status.last_crawl?.records_seen).toBe(1)
		expect((await entityFor(edge!, GTINS.black)).claims.length).toBeGreaterThan(0)

		// Seven days of the same feed, and the delay runs out.
		edge!.clock.advanceDays(7).advance(TEN_MINUTES)
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
		expect((await entityFor(edge!, GTINS.black)).claims).toHaveLength(0)
	})
})

describe.skipIf(!reachable)('delegation', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('_prodid points at another host and the document there names the domain', async () => {
		const at = edge!
		at.net.setTxt('_prodid.acme.example', ['v=prodid0; host=acme.prodid.org'])
		at.net.document('acme.prodid.org', document({ domain: 'acme.example', feeds: ['https://acme.prodid.org/items.ndjson'] }))
		at.net.feed('https://acme.prodid.org/items.ndjson', [JACKET.navy])

		expect(await at.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })

		const status = await json<SourceRecord>(await at.fetch('/source/acme.example'))
		expect(validateSource(status).ok).toBe(true)
		expect(status.trust).toBe('verified')
		expect(status.verified_by).toBe('dns-txt')
		expect(status.last_crawl?.document_url).toBe('https://acme.prodid.org/.well-known/prodid.json')
		expect((await entityFor(at, GTINS.navy)).claims.length).toBeGreaterThan(0)
	})

	test('a name under the hosting zone is hosted and unverified however it was discovered', async () => {
		const at = edge!
		at.net.document('acme.prodid.org', document({ feeds: ['https://acme.prodid.org/items.ndjson'] }))
		at.net.feed('https://acme.prodid.org/items.ndjson', [JACKET.navy])

		// Discovered by a plain ping, through the delivered path, with no row prepared for it.
		expect((await at.fetch('/ping', { method: 'POST', body: JSON.stringify({ domain: 'acme.prodid.org' }) })).status).toBe(202)
		await at.drain()

		const slug = await json<SourceRecord>(await at.fetch('/source/acme.prodid.org'))
		expect(validateSource(slug).ok).toBe(true)
		expect(slug.kind).toBe('hosted')
		expect(slug.trust).toBe('unverified')
		expect(slug.verified_by).toBeUndefined()
	})

	test('a slug that gains a domain keeps every sku and every opid, through the delivered path', async () => {
		const at = edge!
		at.net.document('acme.prodid.org', document({ feeds: ['https://acme.prodid.org/items.ndjson'] }))
		at.net.feed('https://acme.prodid.org/items.ndjson', [JACKET.navy, JACKET.black])

		// The hosted publisher is created by its own crawl, not by the test.
		expect(await at.crawl('acme.prodid.org')).toMatchObject({ kind: 'done', outcome: 'changed' })

		const before = await entityFor(at, GTINS.navy)
		const slug = await json<SourceRecord>(await at.fetch('/source/acme.prodid.org'))
		expect(slug.trust).toBe('unverified')
		expect(slug.kind).toBe('hosted')

		const skusBefore = await at.sql<{ scope: string; value: string; opid: string }[]>`
			select scope, value, opid from identifier where scheme = 'sku' order by value
		`

		// The domain is added: the TXT record names the slug host and the document now names the domain.
		at.clock.advance(TEN_MINUTES)
		at.net.setTxt('_prodid.acme.example', ['v=prodid0; host=acme.prodid.org'])
		at.net.document('acme.prodid.org', document({ domain: 'acme.example', feeds: ['https://acme.prodid.org/items.ndjson'] }))
		expect(await at.crawl('acme.example')).toMatchObject({ kind: 'done' })

		const upgraded = await json<SourceRecord>(await at.fetch('/source/acme.example'))
		expect(validateSource(upgraded).ok).toBe(true)
		expect(upgraded.kind).toBe('domain')
		expect(upgraded.trust).toBe('verified')
		expect(upgraded.verified_by).toBe('dns-txt')
		expect((await at.fetch('/source/acme.prodid.org')).status).toBe(404)

		const after = await entityFor(at, GTINS.navy)
		expect(after.opid).toBe(before.opid)
		const skusAfter = await at.sql<{ scope: string; value: string; opid: string }[]>`
			select scope, value, opid from identifier where scheme = 'sku' order by value
		`
		expect([...skusAfter]).toEqual([...skusBefore])
		// The public scope is the source's name, which is now the domain.
		expect(after.identifiers).toContainEqual({ scheme: 'sku', value: 'TJ-NV-M', scope: 'acme.example' })

		// One publisher, one row, one sku namespace, and the claims were not said twice.
		const rows = await at.sql<{ count: string }[]>`select count(*)::text as count from source`
		expect(rows[0]?.count).toBe('1')
		const names = await at.sql<{ property: string; count: string }[]>`
			select property, count(*)::text as count from claim
			where opid = ${after.opid} and withdrawn_at is null group by property order by property
		`
		for (const row of names) expect(row.count).toBe('1')
	})
})

describe.skipIf(!reachable)('the resolver', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('problem responses carry the spec types', async () => {
		const unknownOpid = await edge!.fetch('/id/kq7m3v9dn2hb4t5x')
		expect(unknownOpid.status).toBe(404)
		expect(unknownOpid.headers.get('content-type')).toStartWith('application/problem+json')
		expect(await json<object>(unknownOpid)).toMatchObject({ type: 'https://prodid.org/problem/unknown-opid', status: 404 })

		expect((await edge!.fetch('/id/NOTANOPID')).status).toBe(404)

		const invalid = await edge!.fetch('/01/12345')
		expect(invalid.status).toBe(400)
		expect(await json<object>(invalid)).toMatchObject({ type: 'https://prodid.org/problem/invalid-gtin' })

		const restricted = await edge!.fetch(`/01/${GTINS.restricted}`)
		expect(restricted.status).toBe(404)
		expect(await json<object>(restricted)).toMatchObject({ type: 'https://prodid.org/problem/restricted-gtin' })

		const unknownGtin = await edge!.fetch(`/01/${GTINS.other}`)
		expect(unknownGtin.status).toBe(404)
		expect(await json<object>(unknownGtin)).toMatchObject({ type: 'https://prodid.org/problem/unknown-gtin' })

		const unknownSource = await edge!.fetch('/source/nobody.example')
		expect(unknownSource.status).toBe(404)
		expect(await json<object>(unknownSource)).toMatchObject({ type: 'https://prodid.org/problem/unknown-source' })
	})

	test('further Digital Link segments are accepted and ignored', async () => {
		acme([JACKET.navy])
		await edge!.crawl('acme.example')
		const direct = await entityFor(edge!, GTINS.navy)
		const withLot = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}/10/LOT42/21/SERIAL9`))
		expect(withLot.opid).toBe(direct.opid)
	})

	test('HTML is served to a browser and JSON to everything else, with an ETag either way', async () => {
		acme([JACKET.navy])
		await edge!.crawl('acme.example')
		const entity = await entityFor(edge!, GTINS.navy)

		const html = await edge!.fetch(`/id/${entity.opid}`, { headers: { accept: 'text/html,*/*;q=0.8' } })
		expect(html.headers.get('content-type')).toStartWith('text/html')
		expect(html.headers.get('vary')).toBe('Accept, Accept-Language')
		expect(await html.text()).toContain(entity.opid)

		const asJson = await edge!.fetch(`/id/${entity.opid}`)
		const etag = asJson.headers.get('etag')
		expect(etag).not.toBeNull()
		expect(etag).not.toBe(html.headers.get('etag'))

		const revalidated = await edge!.fetch(`/id/${entity.opid}`, { headers: { 'if-none-match': etag! } })
		expect(revalidated.status).toBe(304)
		expect(revalidated.headers.get('cache-control')).toContain('max-age=60')
	})

	test('the schemas are served at the URLs their $id names', async () => {
		const response = await edge!.fetch('/schemas/v0/org.prodid.entity.json')
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toStartWith('application/schema+json')
		expect(await json<{ $id: string }>(response)).toMatchObject({ $id: 'https://prodid.org/schemas/v0/org.prodid.entity.json' })
		expect((await edge!.fetch('/schemas/v0/nothing.json')).status).toBe(404)
	})

	test('every schema of both versions, the dump manifest included, answers the same way', async () => {
		for (const [version, directory] of [
			['v0', 'schemas'],
			['v1', 'schemas/v1'],
		] as const) {
			for (const name of ['dump', 'entity', 'feed', 'item', 'source']) {
				const file = `org.prodid.${name}.json`
				const response = await edge!.fetch(`/schemas/${version}/${file}`)
				expect(response.status).toBe(200)
				expect(response.headers.get('content-type')).toBe('application/schema+json; charset=utf-8')
				expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
				expect(response.headers.get('access-control-allow-origin')).toBe('*')
				const schema = await json<{ $id: string }>(response)
				expect(schema.$id).toBe(`https://prodid.org/schemas/${version}/${file}`)
				expect(schema).toEqual(await Bun.file(new URL(`../../../spec/${directory}/${file}`, import.meta.url)).json())
			}
		}
		expect((await edge!.fetch('/schemas/v1/nothing.json')).status).toBe(404)
		expect((await edge!.fetch('/schemas/v2/org.prodid.entity.json')).status).toBe(404)
	})
})

describe.skipIf(!reachable)('conditional requests', () => {
	const FEED_A = 'https://acme.example/a.ndjson'
	const FEED_B = 'https://acme.example/b.ndjson'

	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a document and a feed that both answer 304 make the crawl unchanged', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A] }), { etag: 'd1' })
		edge!.net.feed(FEED_A, [JACKET.navy], { etag: 'a1' })
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		const fetchedBefore = edge!.net.fetched.length
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'unchanged' })

		// Two requests, both answered 304, and nothing was re-read.
		expect(edge!.net.fetched.length - fetchedBefore).toBe(2)
		const status = await json<SourceRecord>(await edge!.fetch('/source/acme.example'))
		expect(status.last_crawl?.http_status).toBe(304)
		expect(status.last_crawl?.outcome).toBe('success')
	})

	test('withdrawal is scoped to the feed that was read, and a 304 sibling is left alone', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A, FEED_B] }), { etag: 'd1' })
		edge!.net.feed(FEED_A, [JACKET.navy, JACKET.black], { etag: 'a1' })
		edge!.net.feed(FEED_B, [JACKET.olive], { etag: 'b1' })
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.feed(FEED_A, [JACKET.navy], { etag: 'a2' })
		const before = edge!.net.fetched.filter((url) => url === FEED_B).length
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })

		// B answered 304 once and was not read again: `record.feed` says which keys were its.
		expect(edge!.net.fetched.filter((url) => url === FEED_B).length - before).toBe(1)
		expect((await entityFor(edge!, GTINS.black)).claims).toHaveLength(0)
		expect((await entityFor(edge!, GTINS.olive)).claims.length).toBeGreaterThan(0)
		expect((await entityFor(edge!, GTINS.navy)).claims.length).toBeGreaterThan(0)

		const feeds = await edge!.sql<{ key: string; feed: string | null }[]>`
			select key, feed from record where withdrawn_at is null order by key
		`
		expect([...feeds]).toEqual([
			{ key: 'tj-navy-m', feed: FEED_A },
			{ key: 'tj-olive-m', feed: FEED_B },
		])
	})

	test('a key that moves to another feed is withdrawn by neither', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED_A, FEED_B] }), { etag: 'd1' })
		edge!.net.feed(FEED_A, [JACKET.navy, JACKET.black])
		edge!.net.feed(FEED_B, [JACKET.olive])
		await edge!.crawl('acme.example')

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.feed(FEED_A, [JACKET.navy])
		edge!.net.feed(FEED_B, [JACKET.olive, JACKET.black])
		await edge!.crawl('acme.example')

		expect((await entityFor(edge!, GTINS.black)).claims.length).toBeGreaterThan(0)
		const moved = await edge!.sql<{ feed: string }[]>`select feed from record where key = 'tj-black-m'`
		expect(moved[0]?.feed).toBe(FEED_B)
	})
})

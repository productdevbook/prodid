import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { type EntityRecord, type SourceRecord, validateEntity, validateSource } from '@prodid/core'
import { ensureDatasetSource, grantAuthority, listAuthority, readSnapshot, revokeAuthority } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { document, GTINS, item } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const HOUR = 3_600_000
const FEED = 'https://acme.example/items.ndjson'
const EVIDENCE = 'https://www.gs1.org/services/verified-by-gs1/results?gtin=04006381333931'

async function publish(): Promise<void> {
	edge!.net.document('acme.example', document({ feeds: [FEED] }))
	edge!.net.feed(FEED, [item({ key: 'navy', brand: 'ARÇELİK', gtin: GTINS.navy })])
	expect((await edge!.crawl('acme.example')).kind).toBe('done')
}

/** What a reader is told about the source: its status, and the trust every claim of it carries. */
async function trust(): Promise<{ status: SourceRecord['trust']; claims: string[] }> {
	const status = await json<SourceRecord>(await edge!.fetch('/source/acme.example'))
	expect(validateSource(status).ok).toBe(true)
	const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))
	expect(validateEntity(entity).ok).toBe(true)
	return { status: status.trust, claims: [...new Set(entity.claims.map((claim) => claim.source.trust))] }
}

function grant(brand = 'Arçelik') {
	return grantAuthority(edge!.sql, { source: 'acme.example', brand, evidence: EVIDENCE, decidedBy: 'operator', now: edge!.clock.now() })
}

describe.skipIf(!reachable)('authority grants', () => {
	beforeEach(async () => {
		await edge!.reset()
		await publish()
	})

	test('a grant makes a verified source authoritative in its status and in every claim', async () => {
		expect(await trust()).toEqual({ status: 'verified', claims: ['verified'] })
		const { grant: granted, created } = await grant()
		expect(created).toBe(true)
		expect(granted).toMatchObject({
			source: 'acme.example',
			brand: 'arçelik',
			evidence: EVIDENCE,
			decided_by: 'operator',
			revoked_at: null,
		})
		expect(await trust()).toEqual({ status: 'authoritative', claims: ['authoritative'] })
		const [stored] = await edge!.sql<{ trust: string }[]>`select trust from source where name = 'acme.example'`
		expect(stored!.trust).toBe('verified')
	})

	test('granting a brand twice keeps one grant, in its normalized form', async () => {
		const first = await grant('ARÇELİK')
		edge!.clock.advance(HOUR)
		const second = await grant('  arçelik ')
		expect(second).toEqual({ grant: first.grant, created: false })
		expect(await listAuthority(edge!.sql, 'acme.example')).toEqual([first.grant])
	})

	test('a revoked grant drops the source at once, and a remaining grant keeps it', async () => {
		const one = await grant('Arçelik')
		const two = await grant('Beko')
		edge!.clock.advance(HOUR)
		const revoked = await revokeAuthority(edge!.sql, { id: one.grant.id, now: edge!.clock.now() })
		expect(revoked).toEqual({ ...one.grant, revoked_at: edge!.clock.now() })
		expect(await trust()).toEqual({ status: 'authoritative', claims: ['authoritative'] })

		edge!.clock.advance(HOUR)
		await revokeAuthority(edge!.sql, { id: two.grant.id, now: edge!.clock.now() })
		expect(await trust()).toEqual({ status: 'verified', claims: ['verified'] })

		edge!.clock.advance(HOUR)
		expect(await revokeAuthority(edge!.sql, { id: one.grant.id, now: edge!.clock.now() })).toEqual(revoked)
		expect(await revokeAuthority(edge!.sql, { id: '999999', now: edge!.clock.now() })).toBeNull()
		expect(await revokeAuthority(edge!.sql, { id: 'nope', now: edge!.clock.now() })).toBeNull()

		const again = await grant('Arçelik')
		expect(again.created).toBe(true)
		expect(again.grant.id).not.toBe(one.grant.id)
		expect(await trust()).toEqual({ status: 'authoritative', claims: ['authoritative'] })
		expect((await listAuthority(edge!.sql, 'acme.example')).map((entry) => entry.revoked_at === null)).toEqual([false, false, true])
	})

	test('a lapse drops the source to verified with no operator action, and recovering restores it', async () => {
		await grant()
		edge!.clock.advance(HOUR)
		edge!.net.serve('https://acme.example/.well-known/prodid.json', { status: 404, headers: { 'content-type': 'text/html' } })
		await edge!.crawl('acme.example')
		const lapsed = await json<SourceRecord>(await edge!.fetch('/source/acme.example'))
		expect(lapsed).toMatchObject({ trust: 'verified', lapsed: true })
		expect(validateSource(lapsed).ok).toBe(true)
		expect(await trust()).toEqual({ status: 'verified', claims: ['verified'] })

		const dumped = await readSnapshot(edge!.sql, async (snapshot) => {
			for await (const line of snapshot.sources()) return line
			return null
		})
		expect(dumped?.trust).toBe('verified')

		edge!.clock.advance(HOUR)
		await publish()
		expect(await trust()).toEqual({ status: 'authoritative', claims: ['authoritative'] })
	})

	test('only a verified domain can be granted, on a public URL, by someone', async () => {
		const now = edge!.clock.now()
		await expect(
			grantAuthority(edge!.sql, { source: 'nobody.example', brand: 'Acme', evidence: EVIDENCE, decidedBy: 'operator', now }),
		).rejects.toThrow(/no source/)
		await ensureDatasetSource(edge!.sql, { slug: 'wikidata', license: 'CC0-1.0', now })
		await expect(
			grantAuthority(edge!.sql, { source: 'dataset:wikidata', brand: 'Acme', evidence: EVIDENCE, decidedBy: 'operator', now }),
		).rejects.toThrow(/not a verified domain/)
		await edge!.sql`insert into source (kind, name) values ('domain', 'fresh.example')`
		await expect(
			grantAuthority(edge!.sql, { source: 'fresh.example', brand: 'Acme', evidence: EVIDENCE, decidedBy: 'operator', now }),
		).rejects.toThrow(/not a verified domain/)
		await expect(
			grantAuthority(edge!.sql, { source: 'acme.example', brand: ' ', evidence: EVIDENCE, decidedBy: 'operator', now }),
		).rejects.toThrow(RangeError)
		await expect(
			grantAuthority(edge!.sql, { source: 'acme.example', brand: 'Acme', evidence: 'http://gs1.example/x', decidedBy: 'operator', now }),
		).rejects.toThrow(RangeError)
		await expect(
			grantAuthority(edge!.sql, { source: 'acme.example', brand: 'Acme', evidence: EVIDENCE, decidedBy: ' ', now }),
		).rejects.toThrow(RangeError)
	})

	test('the database never stores authoritative, and grants only a domain', async () => {
		const [dataset] = await edge!.sql<
			{ id: string }[]
		>`insert into source (kind, name) values ('dataset', 'dataset:wikidata') returning id::text`
		await expect(
			edge!.sql`insert into authority (source, brand, evidence, decided_by) values (${dataset!.id}, 'acme', ${EVIDENCE}, 'operator')`,
		).rejects.toThrow(/only a domain/)
		await expect(edge!.sql`update source set trust = 'authoritative' where name = 'acme.example'`).rejects.toThrow(/source_trust_is_proof/)
		const [acme] = await edge!.sql<{ id: string }[]>`select id::text from source where name = 'acme.example'`
		await edge!.sql`insert into authority (source, brand, evidence, decided_by) values (${acme!.id}, 'acme', ${EVIDENCE}, 'operator')`
		await expect(
			edge!.sql`insert into authority (source, brand, evidence, decided_by) values (${acme!.id}, 'acme', ${EVIDENCE}, 'operator')`,
		).rejects.toThrow(/authority_active/)
	})
})

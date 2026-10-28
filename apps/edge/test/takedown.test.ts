import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import type { EntityRecord } from '@prodid/core'
import { attachMediaClaim, blockMedia } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { document, GTINS, item, png } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001
const FEED = 'https://acme.example/items.ndjson'
const IMAGE = 'https://cdn.example/navy.png'
const MEDIA = [{ url: IMAGE, license: 'CC-BY-4.0' }]

async function mediaClaims(path: string): Promise<EntityRecord['claims']> {
	const entity = await json<EntityRecord>(await edge!.fetch(path))
	return entity.claims.filter((claim) => claim.property === 'media')
}

async function stored(): Promise<{ opid: string; sha256: string }> {
	edge!.net.document('acme.example', document({ feeds: [FEED] }))
	edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, media: MEDIA })])
	edge!.net.serve(IMAGE, { status: 200, headers: { 'content-type': 'image/png' }, body: png(3) })
	await edge!.crawl('acme.example')
	await edge!.drainMedia()
	const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))
	const media = entity.claims.filter((claim) => claim.property === 'media')
	expect(media).toHaveLength(1)
	return { opid: entity.opid, sha256: (media[0]!.value as { sha256: string }).sha256 }
}

describe.skipIf(!reachable)('blocking a hash withdraws its claims', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('the claim leaves /id, stays under ?history=1 with the block time, and a re-crawl does not bring it back', async () => {
		const { opid, sha256 } = await stored()
		edge!.clock.advance(TEN_MINUTES)
		const at = edge!.clock.now()

		expect(await blockMedia(edge!.sql, { sha256, reason: 'copyright notice 2026-10-01', now: at })).toBe(1)

		const entity = await json<EntityRecord>(await edge!.fetch(`/id/${opid}`))
		expect(entity.claims.length).toBeGreaterThan(0)
		expect(entity.claims.filter((claim) => claim.property === 'media')).toHaveLength(0)

		const history = await mediaClaims(`/id/${opid}?history=1`)
		expect(history).toHaveLength(1)
		expect(history[0]!.withdrawn_at).toBe(at.toISOString())

		const [row] = await edge!.sql<{ blocked_at: Date; blocked_reason: string }[]>`
			select blocked_at, blocked_reason from media where sha256 = ${sha256}
		`
		expect(row).toEqual({ blocked_at: at, blocked_reason: 'copyright notice 2026-10-01' })
		const page = await (await edge!.fetch(`/id/${opid}?history=1`, { headers: { accept: 'text/html' } })).text()
		expect(page).not.toContain('copyright notice')

		// The record unchanged, then changed, so that the diff runs and asks for the file again.
		edge!.clock.advance(TEN_MINUTES)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		edge!.clock.advance(TEN_MINUTES)
		edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, name: 'Trail Jacket II', media: MEDIA })])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		const after = await json<EntityRecord>(await edge!.fetch(`/id/${opid}?history=1`))
		expect(after.claims.some((claim) => claim.property === 'name' && claim.value === 'Trail Jacket II')).toBe(true)
		const again = after.claims.filter((claim) => claim.property === 'media')
		expect(again).toHaveLength(1)
		expect(again[0]!.withdrawn_at).toBe(at.toISOString())
		expect(await mediaClaims(`/id/${opid}`)).toHaveLength(0)
	})

	test('every source naming the hash loses its claim, and blocking again withdraws nothing more', async () => {
		const { opid, sha256 } = await stored()
		edge!.net.document('other.example', document({ feeds: ['https://other.example/items.ndjson'] }))
		edge!.net.feed('https://other.example/items.ndjson', [
			item({ key: 'navy', gtin: GTINS.navy, media: [{ url: 'https://other.example/navy.png', license: 'CC0-1.0' }] }),
		])
		edge!.net.serve('https://other.example/navy.png', { status: 200, headers: { 'content-type': 'image/png' }, body: png(3) })
		await edge!.crawl('other.example')
		await edge!.drainMedia()
		expect(await mediaClaims(`/id/${opid}`)).toHaveLength(2)

		expect(await blockMedia(edge!.sql, { sha256, reason: 'first', now: edge!.clock.now() })).toBe(2)
		expect(await mediaClaims(`/id/${opid}`)).toHaveLength(0)

		expect(await blockMedia(edge!.sql, { sha256, reason: 'second', now: edge!.clock.now() })).toBe(0)
		const [row] = await edge!.sql<{ blocked_reason: string }[]>`select blocked_reason from media where sha256 = ${sha256}`
		expect(row?.blocked_reason).toBe('first')
	})

	test('a claim attached after the block is refused by the store itself', async () => {
		const { opid, sha256 } = await stored()
		await blockMedia(edge!.sql, { sha256, reason: 'takedown', now: edge!.clock.now() })

		const attached = await attachMediaClaim(edge!.sql, {
			source: '1',
			recordKey: 'tj-navy-m',
			opid,
			entry: { url: 'https://cdn.example/mirror.png', license: 'CC-BY-4.0' },
			sha256,
			now: edge!.clock.now(),
		})
		expect(attached).toBe(false)
		expect(await mediaClaims(`/id/${opid}?history=1`)).toHaveLength(1)
		expect(await mediaClaims(`/id/${opid}`)).toHaveLength(0)
	})
})

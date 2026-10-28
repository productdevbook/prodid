import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { type EntityRecord, type SourceRecord, V0_DISCOVERY_CUTOFF, validateEntity, validateSource } from '@prodid/core'
import { type DumpSnapshot, readSnapshot } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { document, GTINS, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const CUTOFF = Date.parse(V0_DISCOVERY_CUTOFF)
const HOUR = 3_600_000
const edge = reachable ? await startEdge({ at: new Date(CUTOFF - 3 * HOUR) }) : null
afterAll(async () => {
	await edge?.stop()
})

const FEED = 'https://acme.example/items.ndjson'

function publish(version: 0 | 1, options: { etag?: string } = {}): void {
	edge!.net.document('acme.example', document({ feeds: [FEED], version }), options)
	edge!.net.feed(FEED, [JACKET.navy])
}

function setClock(at: number): void {
	const by = at - edge!.clock.now().getTime()
	if (by < 0) throw new RangeError('the clock only moves forward')
	edge!.clock.advance(by)
}

async function status(): Promise<SourceRecord> {
	const response = await edge!.fetch('/source/acme.example')
	expect(response.status).toBe(200)
	return await json<SourceRecord>(response)
}

describe.skipIf(!reachable)('v0 discovery documents are accepted until the cut-off, v1 always', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('a crawl before the cut-off accepts a v1 document', async () => {
		setClock(CUTOFF - 2 * HOUR)
		publish(1)
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
		expect((await status()).last_crawl?.outcome).toBe('success')
	})

	test('a crawl one millisecond before the cut-off accepts v0; the next, after it, refuses it even behind a 304', async () => {
		setClock(CUTOFF - 1)
		publish(0, { etag: '"v0"' })
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
		expect((await status()).last_crawl?.outcome).toBe('success')

		setClock(CUTOFF + HOUR)
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'rejected' })
		const refused = await status()
		expect(refused.last_crawl?.outcome).not.toBe('success')
		expect(refused.lapsed).toBe(true)
	})

	test('a crawl that starts exactly at the cut-off refuses a v0 document, and the domain becomes no source', async () => {
		const exact = await startEdge({ at: new Date(CUTOFF) })
		try {
			exact.net.document('beta.example', document({ feeds: ['https://beta.example/items.ndjson'], version: 0 }))
			exact.net.feed('https://beta.example/items.ndjson', [JACKET.navy])
			expect(await exact.crawl('beta.example')).toMatchObject({ kind: 'ignored' })
			expect((await exact.fetch('/source/beta.example')).status).toBe(404)
		} finally {
			await exact.stop()
		}
	})

	test('after the cut-off a v1 document is accepted and revalidated with its validators', async () => {
		setClock(CUTOFF + 3 * HOUR)
		publish(1, { etag: '"v1"' })
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })

		edge!.clock.advance(HOUR)
		let asked: Record<string, string> = {}
		edge!.net.serve('https://acme.example/.well-known/prodid.json', ({ headers }) => {
			asked = headers
			return { status: 304, headers: { etag: '"v1"' } }
		})
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'unchanged' })
		expect(asked['if-none-match']).toBe('"v1"')
		expect((await status()).lapsed).toBe(false)
	})
})

describe.skipIf(!reachable)('the index answers v1', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(HOUR)
		publish(1)
		await edge!.crawl('acme.example')
	})

	test('an entity carries "version": 1 after $type and validates as v1', async () => {
		const response = await edge!.fetch(`/01/${GTINS.navy}`, { headers: { accept: 'application/json' } })
		const text = await response.text()
		expect(text).toStartWith('{"$type":"org.prodid.entity","version":1,')
		const entity = JSON.parse(text) as EntityRecord
		expect(validateEntity(entity, { version: 1 }).ok).toBe(true)
		const family = await json<EntityRecord>(await edge!.fetch(`/id/${entity.parents!.family!}?history=1`))
		expect(family.version).toBe(1)
		expect(validateEntity(family, { version: 1 }).ok).toBe(true)
	})

	test('a source status carries "version": 1 after $type and validates as v1', async () => {
		const text = await (await edge!.fetch('/source/acme.example', { headers: { accept: 'application/json' } })).text()
		expect(text).toStartWith('{"$type":"org.prodid.source","version":1,')
		expect(validateSource(JSON.parse(text), { version: 1 }).ok).toBe(true)
	})

	test('every source and entity line of a dump is v1', async () => {
		const dump = await readSnapshot(edge!.sql, async (snapshot: DumpSnapshot) => ({
			sources: await Array.fromAsync(snapshot.sources()),
			entities: await Array.fromAsync(snapshot.entities()),
		}))
		expect(dump.sources.length).toBeGreaterThan(0)
		expect(dump.entities.length).toBeGreaterThan(0)
		for (const line of dump.sources) {
			expect(line.version).toBe(1)
			expect(validateSource(line, { version: 1 }).ok).toBe(true)
		}
		for (const line of dump.entities) {
			expect(line.version).toBe(1)
			expect(validateEntity(line, { version: 1 }).ok).toBe(true)
		}
	})
})

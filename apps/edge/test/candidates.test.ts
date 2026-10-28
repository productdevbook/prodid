import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import type { ItemRecord } from '@prodid/core'
import { findMergeCandidates, ingestRecord, mergeEntities, prepareRecord, revertMerge } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { GTINS, item } from './support/fixtures'
import { startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

async function source(name: string): Promise<string> {
	const rows = await edge!.sql<{ id: string }[]>`insert into source (kind, name) values ('domain', ${name}) returning id::text`
	return rows[0]!.id
}

async function publish(sourceId: string, record: ItemRecord): Promise<string> {
	const prepared = await prepareRecord(record, sourceId)
	if (!prepared.ok) throw new Error(prepared.error)
	const result = await ingestRecord(edge!.sql, { source: sourceId, record: prepared.prepared, now: edge!.clock.now() })
	return result.opid
}

describe.skipIf(!reachable)('merge candidates', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('two sources with one brand and name and no shared identifier are one pair', async () => {
		const maker = await source('maker.example')
		const shop = await source('shop.example')
		const first = await publish(maker, item({ key: 'w1', brand: 'ARÇELİK', name: 'Washer 9 kg', sku: 'M-1' }))
		const second = await publish(shop, item({ key: 'x7', brand: '  Arçelik ', name: 'Washer 9 kg', sku: 'S-7' }))
		expect(first).not.toBe(second)

		const [a, b] = [first, second].sort()
		const sourceOf = (opid: string) => (opid === first ? 'maker.example' : 'shop.example')
		expect(await findMergeCandidates(edge!.sql)).toEqual([
			{ a: { opid: a!, source: sourceOf(a!) }, b: { opid: b!, source: sourceOf(b!) }, brand: 'arçelik', name: 'Washer 9 kg' },
		])
	})

	test('a different name, one source, or two different GTINs make no pair; one GTIN does', async () => {
		const maker = await source('maker.example')
		const shop = await source('shop.example')
		await publish(maker, item({ key: 'a', name: 'Trail Jacket', gtin: GTINS.navy }))
		await publish(shop, item({ key: 'b', name: 'Trail Jacket', gtin: GTINS.black }))
		await publish(maker, item({ key: 'c', name: 'Rain Jacket', sku: 'C' }))
		await publish(maker, item({ key: 'd', name: 'Rain Jacket', sku: 'D' }))
		await publish(maker, item({ key: 'e', name: 'Down Jacket', sku: 'E' }))
		await publish(shop, item({ key: 'f', name: 'Down Vest', sku: 'F' }))
		await publish(maker, item({ key: 'g', brand: 'Other', name: 'Fleece', sku: 'G' }))
		await publish(shop, item({ key: 'h', brand: 'Acme', name: 'Fleece', sku: 'H' }))
		expect(await findMergeCandidates(edge!.sql)).toEqual([])

		const withGtin = await publish(shop, item({ key: 'i', name: 'Rain Jacket', gtin: GTINS.olive }))
		const pairs = await findMergeCandidates(edge!.sql)
		expect(pairs.map((pair) => pair.name)).toEqual(['Rain Jacket', 'Rain Jacket'])
		expect(pairs.every((pair) => pair.a.opid === withGtin || pair.b.opid === withGtin)).toBe(true)
	})

	test('a merged pair is no longer a candidate, and is one again once the merge is reverted', async () => {
		const maker = await source('maker.example')
		const shop = await source('shop.example')
		const first = await publish(maker, item({ key: 'w1', name: 'Washer', sku: 'M-1' }))
		const second = await publish(shop, item({ key: 'x7', name: 'Washer', sku: 'S-7' }))
		const now = edge!.clock.now()

		await mergeEntities(edge!.sql, { from: second, into: first, reason: 'test', decidedBy: 'test', now })
		expect(await findMergeCandidates(edge!.sql)).toEqual([])

		const third = await publish(await source('third.example'), item({ key: 'z', name: 'Washer', sku: 'T' }))
		const afterMerge = await findMergeCandidates(edge!.sql)
		expect(afterMerge).toHaveLength(1)
		expect([afterMerge[0]!.a.opid, afterMerge[0]!.b.opid].sort()).toEqual([first, third].sort())

		await revertMerge(edge!.sql, { from: second, now })
		expect(await findMergeCandidates(edge!.sql)).toHaveLength(3)
	})

	test('a withdrawn record does not count, and the limit caps the pairs', async () => {
		const maker = await source('maker.example')
		const shop = await source('shop.example')
		for (const name of ['One', 'Two', 'Three']) {
			await publish(maker, item({ key: `m-${name}`, name, sku: `M-${name}` }))
			await publish(shop, item({ key: `s-${name}`, name, sku: `S-${name}` }))
		}
		expect(await findMergeCandidates(edge!.sql)).toHaveLength(3)
		expect((await findMergeCandidates(edge!.sql, { limit: 2 })).map((pair) => pair.name)).toEqual(['One', 'Three'])

		const now = edge!.clock.now()
		await edge!.sql`update claim set withdrawn_at = ${now} where source = ${shop} and record_key = 's-One' and withdrawn_at is null`
		await edge!.sql`update record set withdrawn_at = ${now} where source = ${shop} and key = 's-One'`
		expect((await findMergeCandidates(edge!.sql)).map((pair) => pair.name)).toEqual(['Three', 'Two'])
		expect(() => findMergeCandidates(edge!.sql, { limit: 0 })).toThrow(RangeError)
	})
})

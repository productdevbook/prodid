import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { type EntityRecord, type ItemRecord, validateEntity } from '@prodid/core'
import { ingestRecord, mergeEntities, type PreparedRecord, prepareRecord, revertMerge } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { GTINS, item } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

async function source(name: string, kind = 'domain'): Promise<string> {
	const rows = await edge!.sql<{ id: string }[]>`
		insert into source (kind, name) values (${kind}, ${name}) returning id::text
	`
	return rows[0]!.id
}

async function prepared(record: ItemRecord, sourceId: string): Promise<PreparedRecord> {
	const result = await prepareRecord(record, sourceId)
	if (!result.ok) throw new Error(result.error)
	return result.prepared
}

async function counts(): Promise<Record<string, number>> {
	const rows = await edge!.sql<{ kind: string; count: number }[]>`
		select kind, count(*)::int as count from entity group by kind
	`
	const out: Record<string, number> = { family: 0, variant: 0, item: 0 }
	for (const row of rows) out[row.kind] = row.count
	return out
}

/** An entity nothing points at: not a grouping, not an identifier, not a record, not a parent. */
async function orphans(): Promise<string[]> {
	const rows = await edge!.sql<{ opid: string }[]>`
		select e.opid from entity e
		where not exists (select 1 from grouping g where g.opid = e.opid)
			and not exists (select 1 from identifier i where i.opid = e.opid)
			and not exists (select 1 from record r where r.opid = e.opid)
			and not exists (select 1 from entity c where c.parent = e.opid)
	`
	return rows.map((row) => row.opid)
}

describe.skipIf(!reachable)('two crawls at once', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('the same new GTIN from two sources converges on one item and leaves no orphan', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const two = await source('two.example')

		const a = await prepared(item({ key: 'a', gtin: GTINS.navy, sku: 'A-1', group: 'g', variant: { color: 'Navy' } }), one)
		const b = await prepared(item({ key: 'b', gtin: GTINS.navy, sku: 'B-1', group: 'g', variant: { color: 'Navy' } }), two)

		const [first, second] = await Promise.all([
			ingestRecord(edge!.sql, { source: one, record: a, now }),
			ingestRecord(edge!.sql, { source: two, record: b, now }),
		])

		expect(first.opid).toBe(second.opid)
		expect(await counts()).toEqual({ family: 1, variant: 1, item: 1 })
		expect(await orphans()).toEqual([])

		const identifiers = await edge!.sql<{ count: string }[]>`
			select count(*)::text as count from identifier where scheme = 'gtin'
		`
		expect(identifiers[0]?.count).toBe('1')
	})

	test('six sessions racing on one new GTIN still mint one item and nothing else', async () => {
		const now = edge!.clock.now()
		const sources = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((name) => source(`${name}.example`)))
		const records = await Promise.all(
			sources.map((id, index) => prepared(item({ key: `k${index}`, gtin: GTINS.black, sku: `S-${index}` }), id)),
		)

		const results = await Promise.all(sources.map((id, index) => ingestRecord(edge!.sql, { source: id, record: records[index]!, now })))
		expect(new Set(results.map((result) => result.opid)).size).toBe(1)
		expect(await counts()).toEqual({ family: 1, variant: 1, item: 1 })
		expect(await orphans()).toEqual([])
	})

	test('two records of one new group from one source share a family and leave no orphan', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')

		const navy = await prepared(item({ key: 'navy', gtin: GTINS.navy, group: 'trail', variant: { color: 'Navy' } }), one)
		const black = await prepared(item({ key: 'black', gtin: GTINS.black, group: 'trail', variant: { color: 'Black' } }), one)

		await Promise.all([
			ingestRecord(edge!.sql, { source: one, record: navy, now }),
			ingestRecord(edge!.sql, { source: one, record: black, now }),
		])

		expect(await counts()).toEqual({ family: 1, variant: 2, item: 2 })
		expect(await orphans()).toEqual([])
		const families = await edge!.sql<{ count: string }[]>`
			select count(*)::text as count from grouping where kind = 'family'
		`
		expect(families[0]?.count).toBe('1')
	})

	test('gtin wins a disagreement, nothing is merged, and the crawl records it', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const two = await source('two.example')

		// Two entities exist first: one holds the GTIN, the other holds an mpn under the same brand.
		await ingestRecord(edge!.sql, {
			source: one,
			record: await prepared(item({ key: 'gtin-holder', gtin: GTINS.navy }), one),
			now,
		})
		const mpnRecord = { ...item({ key: 'mpn-holder' }), identifiers: [{ scheme: 'mpn', value: 'TJ-NAVY' }] } as ItemRecord
		const mpnOwner = await ingestRecord(edge!.sql, { source: two, record: await prepared(mpnRecord, two), now })

		const both = {
			...item({ key: 'both', gtin: GTINS.navy }),
			identifiers: [
				{ scheme: 'gtin', value: GTINS.navy },
				{ scheme: 'mpn', value: 'TJ-NAVY' },
			],
		} as ItemRecord
		const result = await ingestRecord(edge!.sql, { source: two, record: await prepared(both, two), now })

		expect(result.opid).not.toBe(mpnOwner.opid)
		expect(result.disagreement).not.toBeNull()
		expect(result.disagreement!.others).toContain(mpnOwner.opid)
		// Nothing was merged: the mpn still points where it did.
		const rows = await edge!.sql<{ opid: string }[]>`select opid from identifier where scheme = 'mpn'`
		expect(rows[0]?.opid).toBe(mpnOwner.opid)
	})
})

describe.skipIf(!reachable)('merge and revert', () => {
	beforeEach(async () => {
		await edge!.reset()
	})

	test('the losing opid answers 308, the survivor answers for both, and the revert is lossless', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const two = await source('two.example')

		const left = await ingestRecord(edge!.sql, {
			source: one,
			record: await prepared(item({ key: 'left', name: 'Trail Jacket', gtin: GTINS.navy, sku: 'L-1' }), one),
			now,
		})
		const right = await ingestRecord(edge!.sql, {
			source: two,
			record: await prepared(item({ key: 'right', name: 'Trail Jacket', gtin: GTINS.black, sku: 'R-1' }), two),
			now,
		})

		const before = await json<EntityRecord>(await edge!.fetch(`/id/${left.opid}`))
		expect(before.identifiers).toHaveLength(2)

		const merged = await mergeEntities(edge!.sql, {
			from: left.opid,
			into: right.opid,
			reason: 'same trade item',
			decidedBy: 'test',
			now,
		})
		expect(merged.survivor).toBe(right.opid)

		const redirect = await edge!.fetch(`/id/${left.opid}`, { redirect: 'manual' })
		expect(redirect.status).toBe(308)
		expect(redirect.headers.get('location')).toBe(`/id/${right.opid}`)

		const survivor = await json<EntityRecord>(await edge!.fetch(`/id/${right.opid}`))
		const valid = validateEntity(survivor)
		if (!valid.ok) throw new Error(`survivor is not valid: ${JSON.stringify(valid.errors)}`)
		expect(survivor.merged_from).toEqual([left.opid])
		// Identifiers and claims are never repointed; the survivor answers for both opids.
		expect(survivor.identifiers.map((identifier) => identifier.value)).toContain(GTINS.navy.padStart(14, '0'))
		expect(survivor.identifiers.map((identifier) => identifier.value)).toContain(GTINS.black.padStart(14, '0'))
		expect(survivor.claims.length).toBe(before.claims.length * 2)

		expect(await revertMerge(edge!.sql, { from: left.opid, now })).toBe(true)
		const after = await json<EntityRecord>(await edge!.fetch(`/id/${left.opid}`))
		expect(validateEntity(after).ok).toBe(true)
		expect(after.opid).toBe(before.opid)
		expect(after.identifiers).toEqual(before.identifiers)
		expect(after.claims.map((claim) => [claim.property, claim.value, claim.seen_at])).toEqual(
			before.claims.map((claim) => [claim.property, claim.value, claim.seen_at]),
		)

		const survivorAfter = await json<EntityRecord>(await edge!.fetch(`/id/${right.opid}`))
		expect(survivorAfter.merged_from).toBeUndefined()
	})

	test('merging a survivor repoints everything that pointed at it, in one transaction', async () => {
		const now = edge!.clock.now()
		const one = await source('one.example')
		const keys = ['a', 'b', 'c']
		const made = []
		for (const key of keys) {
			made.push(
				await ingestRecord(edge!.sql, {
					source: one,
					record: await prepared(item({ key, gtin: key === 'a' ? GTINS.navy : key === 'b' ? GTINS.black : GTINS.olive }), one),
					now,
				}),
			)
		}
		const [a, b, c] = made.map((entry) => entry.opid) as [string, string, string]

		await mergeEntities(edge!.sql, { from: a, into: b, reason: 'first', decidedBy: 'test', now })
		const second = await mergeEntities(edge!.sql, { from: b, into: c, reason: 'second', decidedBy: 'test', now })
		expect(second.repointed).toEqual([a])

		for (const losing of [a, b]) {
			const redirect = await edge!.fetch(`/id/${losing}`, { redirect: 'manual' })
			expect(redirect.status).toBe(308)
			expect(redirect.headers.get('location')).toBe(`/id/${c}`)
		}

		const chains = await edge!.sql<{ opid: string }[]>`
			select e.opid from entity e join entity t on t.opid = e.merged_into where t.merged_into is not null
		`
		expect([...chains]).toEqual([])
	})
})

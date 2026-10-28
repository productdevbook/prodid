import { normalizeBrand } from '@prodid/core'

import type { Sql } from './client'

export const DEFAULT_CANDIDATE_LIMIT = 100

export interface CandidateSide {
	opid: string
	/** `source.name` of a source whose active record puts this brand and name on the item. */
	source: string
}

export interface MergeCandidate {
	/** The side with the lower opid. */
	a: CandidateSide
	b: CandidateSide
	/** The normalized brand both sides share. */
	brand: string
	name: string
}

interface NameGroup {
	/** The name claim's `jsonb` as text. */
	name: string
	entries: string
}

interface Entry {
	opid: string
	source: string
	brand: string
	has_gtin: boolean
}

interface Item {
	sources: Set<string>
	hasGtin: boolean
}

/**
 * Pairs of unmerged items that items from different sources call by one normalized brand and an
 * identical name, where at most one of the two carries a GTIN: two different GTINs are two products.
 * Claims on a merged opid count for its survivor. It only reads; deciding a merge is a person's job.
 */
export function findMergeCandidates(sql: Sql, options: { limit?: number } = {}): Promise<MergeCandidate[]> {
	const limit = options.limit ?? DEFAULT_CANDIDATE_LIMIT
	if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer, got ${limit}`)

	return sql.begin('read only', async (tx) => {
		const found: MergeCandidate[] = []
		const groups = tx<NameGroup[]>`
			with entry as (
				select n.value as name, t.opid, s.name as source, b.value #>> '{}' as brand
				from claim n
				join claim b on b.source = n.source and b.record_key = n.record_key and b.opid = n.opid
					and b.property = 'brand' and b.withdrawn_at is null and jsonb_typeof(b.value) = 'string'
				join entity e on e.opid = n.opid
				join entity t on t.opid = coalesce(e.merged_into, e.opid) and t.kind = 'item'
				join source s on s.id = n.source
				where n.property = 'name' and n.withdrawn_at is null and n.record_key is not null
					and jsonb_typeof(n.value) = 'string'
			),
			grouped as (
				select name from entry group by name having count(distinct opid) > 1 and count(distinct source) > 1
			),
			distinct_entry as (
				select distinct entry.name, entry.opid, entry.source, entry.brand from entry join grouped using (name)
			)
			select d.name::text as name, json_agg(json_build_object(
				'opid', d.opid,
				'source', d.source,
				'brand', d.brand,
				'has_gtin', exists (
					select 1 from identifier i join entity ie on ie.opid = i.opid
					where i.scheme = 'gtin' and coalesce(ie.merged_into, ie.opid) = d.opid
				)
			) order by d.opid, d.source, d.brand)::text as entries
			from distinct_entry d
			group by d.name
			order by d.name::text
		`.cursor(100)

		for await (const batch of groups) {
			for (const group of batch) {
				const name = JSON.parse(group.name) as string
				for (const candidate of pairsIn(name, JSON.parse(group.entries) as Entry[])) {
					found.push(candidate)
					if (found.length === limit) return found
				}
			}
		}
		return found
	})
}

function pairsIn(name: string, entries: Entry[]): MergeCandidate[] {
	const byBrand = new Map<string, Map<string, Item>>()
	for (const entry of entries) {
		const brand = normalizeBrand(entry.brand)
		let items = byBrand.get(brand)
		if (items === undefined) byBrand.set(brand, (items = new Map()))
		let item = items.get(entry.opid)
		if (item === undefined) items.set(entry.opid, (item = { sources: new Set(), hasGtin: entry.has_gtin }))
		item.sources.add(entry.source)
	}

	const pairs: MergeCandidate[] = []
	for (const brand of [...byBrand.keys()].sort()) {
		const items = byBrand.get(brand)!
		const opids = [...items.keys()].sort()
		for (let i = 0; i < opids.length; i += 1) {
			for (let j = i + 1; j < opids.length; j += 1) {
				const a = items.get(opids[i]!)!
				const b = items.get(opids[j]!)!
				if (a.hasGtin && b.hasGtin) continue
				const sources = differentSources(a.sources, b.sources)
				if (sources === null) continue
				pairs.push({ a: { opid: opids[i]!, source: sources[0] }, b: { opid: opids[j]!, source: sources[1] }, brand, name })
			}
		}
	}
	return pairs
}

function differentSources(a: Set<string>, b: Set<string>): [string, string] | null {
	for (const left of [...a].sort()) {
		for (const right of [...b].sort()) {
			if (left !== right) return [left, right]
		}
	}
	return null
}

import { describe, expect, test } from 'bun:test'

import {
	mapWikidataEntity,
	WIKIDATA_BRAND,
	WIKIDATA_GTIN,
	wikidataBrandIds,
	wikidataEnglishLabel,
	type WikidataResult,
} from '../src/datasets/wikidata'

const FIXTURES = new URL('../../../spec/fixtures/datasets/wikidata/', import.meta.url)
const entities = (await Bun.file(new URL('entities.json', FIXTURES)).json()) as { id: string }[]
const expected = (await Bun.file(new URL('expected.json', FIXTURES)).json()) as Record<string, Record<string, unknown>>

function importAll(dump: unknown[]): Map<string, WikidataResult> {
	const wanted = new Set(dump.flatMap(wikidataBrandIds))
	const labels = new Map<string, string>()
	for (const entity of dump) {
		const { id } = entity as { id: string }
		const label = wikidataEnglishLabel(entity)
		if (wanted.has(id) && label !== null) labels.set(id, label)
	}
	return new Map(dump.map((entity) => [(entity as { id: string }).id, mapWikidataEntity(entity, (id) => labels.get(id))]))
}

describe('the Wikidata mapping', () => {
	const results = importAll(entities)

	test('every input entity has an expected outcome, and every outcome an entity', () => {
		expect([...results.keys()].sort()).toEqual(Object.keys(expected).sort())
	})

	test.each(entities.map((entity) => entity.id))('maps or skips %s as expected', (id) => {
		const result = results.get(id)
		const want = expected[id]
		expect(result).toMatchObject(want ?? {})
		if (result?.ok === true) expect(result as WikidataResult).toEqual({ id, ...want } as WikidataResult)
	})

	test('counts what it skipped, by reason', () => {
		const counts: Record<string, number> = {}
		for (const result of results.values()) {
			const outcome = result.ok ? 'mapped' : result.skip
			counts[outcome] = (counts[outcome] ?? 0) + 1
		}
		expect(counts).toEqual({ mapped: 3, 'no-gtin': 5, 'no-brand': 3, 'no-label': 1, 'not-an-item': 2 })
	})

	test('uses the property ids confirmed on wikidata.org', () => {
		expect(WIKIDATA_GTIN).toBe('P3962')
		expect(WIKIDATA_BRAND).toBe('P1716')
	})
})

describe('mapWikidataEntity', () => {
	const statement = (property: string, value: unknown) => ({
		mainsnak: { snaktype: 'value', property, datavalue: { value } },
		type: 'statement',
		rank: 'normal',
	})
	const entity = {
		type: 'item',
		id: 'Q42',
		labels: { en: { language: 'en', value: 'Trail Bottle 1L' } },
		claims: {
			P3962: [statement('P3962', '9506000134420')],
			P1716: [statement('P1716', { 'entity-type': 'item', id: 'Q7' })],
		},
	}

	test('keys the record by the QID and writes nothing the chapter does not name', () => {
		const result = mapWikidataEntity(entity, () => 'Acme')
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(Object.keys(result.record).sort()).toEqual(['$type', 'brand', 'identifiers', 'key', 'lang', 'name'])
		expect(result.record.key).toBe('Q42')
	})

	test('refuses what is not a Wikidata item, whatever it is', () => {
		for (const value of [null, 'Q42', [], {}, { ...entity, id: 'Q042' }, { ...entity, type: 'property' }]) {
			expect(mapWikidataEntity(value, () => 'Acme')).toMatchObject({ ok: false, id: null, skip: 'not-an-item' })
		}
	})

	test('a brand label the record cannot hold makes the entity invalid, not a crash', () => {
		const result = mapWikidataEntity(entity, () => 'x'.repeat(257))
		expect(result).toMatchObject({ ok: false, id: 'Q42', skip: 'invalid' })
		if (!result.ok) expect(result.reason).toStartWith('/brand ')
	})

	test('asks the labels only for the brands the entity names', () => {
		const asked: string[] = []
		mapWikidataEntity(entity, (id) => {
			asked.push(id)
			return 'Acme'
		})
		expect(asked).toEqual(['Q7'])
		expect(wikidataBrandIds(entity)).toEqual(['Q7'])
	})

	test('reads no brand from a malformed statement', () => {
		const odd = { ...entity, claims: { ...entity.claims, P1716: [statement('P1716', 'Q7'), { rank: 'normal' }, 7] } }
		expect(wikidataBrandIds(odd)).toEqual([])
		expect(mapWikidataEntity(odd, () => 'Acme')).toMatchObject({ ok: false, skip: 'no-brand' })
	})
})

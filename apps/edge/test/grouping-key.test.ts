import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ingestRecord, prepareRecord } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { gtin13, item } from './support/fixtures'
import { startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const MIGRATION = readFileSync(join(import.meta.dir, '..', '..', '..', 'db', 'migrations', '0006_grouping_key.sql'), 'utf8')
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf('with keys as'), MIGRATION.indexOf('g.key = w.key;') + 'g.key = w.key;'.length)

const RECORDS = [
	item({ key: 'plain', gtin: gtin13('400638133701') }),
	item({ key: 'k "quoted" \\ back\u0001\n', gtin: gtin13('400638133702'), variant: { size: 'M', color: 'Navy' } }),
	item({ key: 'grouped', group: 'İstanbul "g" \\ \t 🧥  ', gtin: gtin13('400638133703'), variant: { zeta: 'z', aB: 'Ä', a: '"' } }),
	item({ key: 'grouped-2', group: 'İstanbul "g" \\ \t 🧥  ', gtin: gtin13('400638133704'), variant: { zeta: 'y' } }),
]

describe.skipIf(!reachable)('the written grouping key backfill', () => {
	test('fills every row a record body produces with exactly what ingest writes', async () => {
		await edge!.reset()
		const sources = []
		for (const name of ['one.example', 'two.example']) {
			const [row] = await edge!.sql<{ id: string }[]>`insert into source (kind, name) values ('domain', ${name}) returning id::text`
			sources.push(row!.id)
		}
		for (const source of sources) {
			for (const record of RECORDS) {
				const prepared = await prepareRecord(record, source)
				if (!prepared.ok) throw new Error(prepared.error)
				await ingestRecord(edge!.sql, { source, record: prepared.prepared, now: edge!.clock.now() })
			}
		}
		const written = async () => [
			...(await edge!.sql<{ source: string; kind: string; key: string; written: string | null }[]>`
				select source::text, kind, key, written_key::text as written from grouping order by source, kind, key
			`),
		]
		const before = await written()
		expect(before).toHaveLength(14)
		expect(before.every((row) => row.written !== null)).toBe(true)

		await edge!.sql`update grouping set written_key = null`
		await edge!.sql.unsafe(BACKFILL)
		expect(await written()).toEqual(before)
	})
})

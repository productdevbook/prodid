import { describe, expect, test } from 'bun:test'

import { convertMerchant } from '../src/merchant'

const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)

describe('convertMerchant', () => {
	test('turns the spec fixture into its feed.ndjson byte for byte, skipping the rows expected.json names', async () => {
		const expected = (await Bun.file(new URL('expected.json', MERCHANT)).json()) as Record<
			string,
			{ ndjson: string; declared: { lang: string; markets: string[]; license: string }; skipped_rows: number[] }
		>
		for (const [name, entry] of Object.entries(expected)) {
			const conversion = await convertMerchant(Bun.file(new URL(name, MERCHANT)).stream(), entry.declared)
			expect(conversion.ndjson).toBe(await Bun.file(new URL(entry.ndjson, MERCHANT)).text())
			expect(conversion.skipped.map((row) => row.row)).toEqual(entry.skipped_rows)
		}
	})

	test('reports values with no home in the record instead of dropping them silently', async () => {
		const conversion = await convertMerchant(Bun.file(new URL('feed.csv', MERCHANT)).stream(), {
			lang: 'en',
			markets: ['TR'],
			license: 'CC-BY-4.0',
		})
		expect(conversion.dropped.length).toBeGreaterThan(0)
		for (const row of conversion.dropped) expect(row.values.length).toBeGreaterThan(0)
	})
})

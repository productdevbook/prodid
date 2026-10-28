import { importMerchantRow, type MerchantDeclaration, readDelimited } from '@prodid/core'

export interface SkippedRow {
	row: number
	reason: string
}

export interface DroppedValues {
	row: number
	values: string[]
}

export interface MerchantConversion {
	ndjson: string
	items: number
	skipped: SkippedRow[]
	dropped: DroppedValues[]
}

/** The conversion `prodid-batch merchant` runs, here in the Worker: core is pure, so it runs anywhere. */
export async function convertMerchant(stream: ReadableStream<Uint8Array>, declared: MerchantDeclaration): Promise<MerchantConversion> {
	const lines: string[] = []
	const skipped: SkippedRow[] = []
	const dropped: DroppedValues[] = []
	for await (const entry of readDelimited(stream)) {
		if (!entry.ok) {
			skipped.push({ row: entry.row, reason: entry.error })
			continue
		}
		const result = importMerchantRow({ row: entry.row, values: entry.values }, declared)
		if (!result.ok) {
			skipped.push({ row: result.row, reason: result.reason })
			continue
		}
		lines.push(`${JSON.stringify(result.record)}\n`)
		if (result.dropped.length > 0) dropped.push({ row: result.row, values: result.dropped })
	}
	return { ndjson: lines.join(''), items: lines.length, skipped, dropped }
}

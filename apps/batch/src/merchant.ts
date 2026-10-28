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
	/** One `org.prodid.item` per line, newline-terminated, ready to upload as a feed. */
	ndjson: string
	items: number
	skipped: SkippedRow[]
	dropped: DroppedValues[]
}

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
		lines.push(JSON.stringify(result.record))
		if (result.dropped.length > 0) dropped.push({ row: result.row, values: result.dropped })
	}
	return { ndjson: lines.map((line) => `${line}\n`).join(''), items: lines.length, skipped, dropped }
}

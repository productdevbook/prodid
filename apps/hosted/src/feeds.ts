import { readNdjson, validateItem } from '@prodid/core'

/**
 * A feed is validated whole before it is stored, so the upload has to fit in the isolate's 128 MB
 * next to its parse. A catalogue larger than this is split across feeds; a document lists up to 100.
 */
export const MAX_FEED_BYTES = 33_554_432

/** The crawler skips a line over 64 KiB, so one is refused here rather than published to be skipped. */
export const MAX_LINE_BYTES = 65_536

const MAX_REPORTED = 20

export interface FeedProblem {
	line: number
	error: string
}

export type FeedCheck = { ok: true; items: number } | { ok: false; problems: FeedProblem[] }

/**
 * Every line must be an `org.prodid.item` and every `key` unique, because a duplicate key is two
 * products the crawler cannot tell apart. The first problems are reported with their line numbers.
 */
export async function checkFeed(bytes: Uint8Array<ArrayBuffer>): Promise<FeedCheck> {
	const problems: FeedProblem[] = []
	const keys = new Map<string, number>()
	let items = 0
	const stream = new Blob([bytes]).stream()
	for await (const entry of readNdjson(stream, { maxLineBytes: MAX_LINE_BYTES })) {
		if (problems.length >= MAX_REPORTED) break
		if (!entry.ok) {
			problems.push({ line: entry.line, error: entry.error })
			continue
		}
		const result = validateItem(entry.value)
		if (!result.ok) {
			const error = result.errors[0]
			problems.push({ line: entry.line, error: error === undefined ? 'invalid item' : `${error.path || '/'} ${error.message}` })
			continue
		}
		const first = keys.get(result.value.key)
		if (first !== undefined) {
			problems.push({ line: entry.line, error: `key ${result.value.key} already on line ${first}` })
			continue
		}
		keys.set(result.value.key, entry.line)
		items++
	}
	if (problems.length > 0) return { ok: false, problems }
	if (items === 0) return { ok: false, problems: [{ line: 0, error: 'feed has no items' }] }
	return { ok: true, items }
}

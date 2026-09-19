const QUOTE = 0x22
const CR = 0x0d
const LF = 0x0a
const COMMA = 0x2c
const TAB = 0x09
const BOM = 0xfeff

export type Delimiter = 'comma' | 'tab'

export interface DelimitedOptions {
	/** Taken from the header line when it is not given. */
	delimiter?: Delimiter
	/** A record longer than this is reported and discarded rather than buffered. */
	maxRecordChars?: number
}

export type DelimitedEntry = { row: number; ok: true; values: Record<string, string[]> } | { row: number; ok: false; error: string }

export const DEFAULT_MAX_RECORD_CHARS = 1_048_576

interface Taken {
	fields: string[]
	length: number
	delimiter: number
}

/**
 * Reads a CSV or TSV file off a byte stream, one entry per record, numbered the way a spreadsheet
 * numbers its rows — the header is row 1 — so a publisher can find the row being complained about.
 * A quoted field may hold the delimiter, doubled quotes and newlines of either kind; a leading byte
 * order mark is dropped; the delimiter is taken from the header when it is not given.
 *
 * Every column is a list, one entry per physical column carrying that header name, so a header
 * repeated across columns — how the Merchant format spells a repeated attribute — keeps its values
 * apart even when one of them contains the separator itself.
 */
export async function* readDelimited(stream: ReadableStream<Uint8Array>, options: DelimitedOptions = {}): AsyncGenerator<DelimitedEntry> {
	const maxRecordChars = options.maxRecordChars ?? DEFAULT_MAX_RECORD_CHARS
	const reader = stream.getReader()
	const decoder = new TextDecoder()
	let pending = ''
	let started = false
	let ended = false
	let header: string[] | null = null
	let delimiter = options.delimiter === undefined ? null : charOf(options.delimiter)
	let row = 0

	try {
		while (!ended) {
			const chunk = await reader.read()
			pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
			ended = chunk.done
			if (!started) {
				if (pending.charCodeAt(0) === BOM) pending = pending.slice(1)
				started = pending.length > 0 || ended
			}

			for (;;) {
				const taken = takeRecord(pending, delimiter, ended)
				if (taken === null) break
				pending = pending.slice(taken.length)
				row += 1
				if (blank(taken.fields)) continue
				if (header === null) {
					delimiter ??= taken.delimiter
					header = taken.fields.map((name) => name.trim())
					continue
				}
				yield { row, ok: true, values: zip(header, taken.fields) }
			}

			if (!ended && pending.length > maxRecordChars) {
				yield { row: row + 1, ok: false, error: `record exceeds ${maxRecordChars} characters` }
				pending = ''
				ended = true
			}
		}
	} finally {
		reader.releaseLock()
	}
}

/**
 * One record from the front of `text`, or null while the text so far could still be the middle of a
 * quoted field. At the end of the stream a trailing record with no newline is taken as it stands.
 */
function takeRecord(text: string, delimiter: number | null, atEnd: boolean): Taken | null {
	if (text.length === 0) return null
	const fields: string[] = []
	let field = ''
	let quoted = false
	let at = 0
	let found = delimiter

	while (at < text.length) {
		const code = text.charCodeAt(at)
		if (quoted) {
			if (code === QUOTE && text.charCodeAt(at + 1) === QUOTE) {
				field += '"'
				at += 2
				continue
			}
			if (code === QUOTE) {
				// A quote at the very end may yet be the first of a doubled pair.
				if (at + 1 === text.length && !atEnd) return null
				quoted = false
				at += 1
				continue
			}
			field += text[at]
			at += 1
			continue
		}
		if (code === QUOTE && field === '') {
			quoted = true
			at += 1
			continue
		}
		if (found === null && (code === COMMA || code === TAB)) found = code
		if (code === found) {
			fields.push(field)
			field = ''
			at += 1
			continue
		}
		if (code === CR || code === LF) {
			fields.push(field)
			const skip = code === CR && text.charCodeAt(at + 1) === LF ? 2 : 1
			if (code === CR && at + 1 === text.length && !atEnd) return null
			return { fields, length: at + skip, delimiter: found ?? COMMA }
		}
		field += text[at]
		at += 1
	}

	if (!atEnd || quoted) return null
	fields.push(field)
	return { fields, length: text.length, delimiter: found ?? COMMA }
}

function blank(fields: string[]): boolean {
	return fields.every((value) => value.trim() === '')
}

function zip(header: string[], fields: string[]): Record<string, string[]> {
	const values: Record<string, string[]> = {}
	for (let i = 0; i < header.length; i += 1) {
		const name = header[i]!
		if (name === '') continue
		;(values[name] ??= []).push((fields[i] ?? '').trim())
	}
	return values
}

function charOf(delimiter: Delimiter): number {
	return delimiter === 'tab' ? TAB : COMMA
}

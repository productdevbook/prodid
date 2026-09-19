const LF = 0x0a
const CR = 0x0d

export const DEFAULT_MAX_LINE_BYTES = 1_048_576

export interface NdjsonOptions {
	/** Lines longer than this are reported and discarded instead of being buffered. */
	maxLineBytes?: number
}

export type NdjsonEntry = { line: number; ok: true; value: unknown } | { line: number; ok: false; error: string }

/**
 * Reads NDJSON off a byte stream, one entry per non-blank line. Lines are split on the raw bytes,
 * so a multi-byte character straddling two chunks is never cut in half.
 */
export async function* readNdjson(stream: ReadableStream<Uint8Array>, options: NdjsonOptions = {}): AsyncGenerator<NdjsonEntry> {
	const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
	const decoder = new TextDecoder()
	const reader = stream.getReader()
	let parts: Uint8Array[] = []
	let pending = 0
	let discarding = false
	let line = 0
	try {
		for (;;) {
			const chunk = await reader.read()
			if (chunk.done) break
			let start = 0
			for (;;) {
				const lf = chunk.value.indexOf(LF, start)
				const end = lf === -1 ? chunk.value.length : lf
				if (!discarding && end > start) {
					if (pending + (end - start) > maxLineBytes) {
						discarding = true
						parts = []
						pending = 0
						yield { line: line + 1, ok: false, error: `line exceeds ${maxLineBytes} bytes` }
					} else {
						parts.push(chunk.value.subarray(start, end))
						pending += end - start
					}
				}
				if (lf === -1) break
				line += 1
				if (discarding) discarding = false
				else {
					const entry = decodeLine(parts, decoder, line)
					if (entry !== null) yield entry
				}
				parts = []
				pending = 0
				start = lf + 1
			}
		}
		if (!discarding && parts.length > 0) {
			line += 1
			const entry = decodeLine(parts, decoder, line)
			if (entry !== null) yield entry
		}
	} finally {
		reader.releaseLock()
	}
}

function decodeLine(parts: Uint8Array[], decoder: TextDecoder, line: number): NdjsonEntry | null {
	let bytes = parts.length === 1 ? parts[0]! : concat(parts)
	if (bytes.length > 0 && bytes[bytes.length - 1] === CR) bytes = bytes.subarray(0, bytes.length - 1)
	const text = decoder.decode(bytes).trim()
	if (text === '') return null
	try {
		return { line, ok: true, value: JSON.parse(text) }
	} catch (error) {
		return { line, ok: false, error: error instanceof Error ? error.message : String(error) }
	}
}

function concat(parts: Uint8Array[]): Uint8Array {
	let total = 0
	for (const part of parts) total += part.length
	const out = new Uint8Array(total)
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.length
	}
	return out
}

import { checkFetchable, isIngestibleLicence, type MediaEntry, SNIFF_BYTES, sniffMedia, type SniffedType } from '@prodid/core'
import { attachMediaClaim, findMedia, recordMedia } from '@prodid/store'

import { GuardedFetcher } from '../net/guard'
import type { MediaMessage, Services } from '../services'
import { IMMUTABLE, mediaKey } from './store'

export type MediaStep =
	| { kind: 'deferred'; retryAfterMs: number }
	/** The file is not usable: the wrong bytes, too many of them, or a hash that may not be stored. */
	| { kind: 'refused'; reason: string }
	/** Nothing could be concluded. The record keeps its other claims and the crawl is unaffected. */
	| { kind: 'failed'; reason: string }
	| { kind: 'stored'; sha256: string; claimed: number; reused: boolean }

/**
 * One file, fetched through the same guard and the same per-host budget as everything else, stored
 * under its digest, and only then claimed.
 *
 * The digest has to be known before the key is, and R2 cannot rename, so the bytes are held once:
 * the chunks are collected under the cap and concatenated once to be hashed and put. Peak memory is
 * about twice the file and never more than twice `caps.mediaBytes`, which is what keeps one message
 * inside the 128 MB isolate — a cap the runtime would kill us for reaching is not a cap. Streaming
 * to a temporary key and re-putting under the digest would avoid the copy at the price of writing
 * every byte twice and reading it back, which is worse for files this size.
 */
export async function runMediaStep(services: Services, message: MediaMessage): Promise<MediaStep> {
	const entry: MediaEntry = message.entry
	// The licence is a string, so it is checked before anything is fetched: a file nobody may
	// redistribute is one the index never asks for.
	if (!isIngestibleLicence(entry.license)) return { kind: 'refused', reason: 'licence is not ingestible' }
	const target = checkFetchable(entry.url)
	if (!target.ok) return { kind: 'refused', reason: target.reason }

	// Media is not bound to the document's host, so both budgets are taken at the host that serves
	// it: the unverified lane like any other fetch, and the media-specific one on top of it.
	const budget = await services.limits.hostFetch(target.host, false, services.now(), message.zone)
	if (!budget.ok) return { kind: 'deferred', retryAfterMs: budget.retryAfterMs }
	const reserve = capFor(entry.kind ?? 'document', services.caps)
	const media = await services.limits.mediaFetch(target.host, reserve, services.now())
	if (!media.ok) return { kind: 'deferred', retryAfterMs: media.retryAfterMs }

	const weight = { bytes: 0 }
	try {
		return await fetchAndStore(services, message, entry, weight)
	} finally {
		// Settled whatever happened: a reservation left at the cap after a failure or an abort would
		// sit in the window for a minute as if those bytes had been spent.
		if (media.ticket !== null) await services.limits.settleMedia(target.host, media.ticket, weight.bytes)
	}
}

async function fetchAndStore(services: Services, message: MediaMessage, entry: MediaEntry, weight: { bytes: number }): Promise<MediaStep> {
	const fetcher = new GuardedFetcher(services.net, services.caps)
	const deadline = AbortSignal.timeout(services.caps.mediaMs)
	const response = await fetcher.fetch(entry.url, { deadline, firstByteMs: services.caps.firstByteMs })
	if (!response.ok) return { kind: 'failed', reason: response.reason }
	if (response.status !== 200 || response.body === null) {
		await response.body?.cancel().catch(() => {})
		return { kind: 'failed', reason: `status-${response.status}` }
	}

	let read: { bytes: Uint8Array; type: SniffedType | null }
	try {
		read = await readCapped(fetcher.limit(response.body, capFor('document', services.caps), deadline), entry, services.caps)
	} catch (error) {
		return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
	}
	const { bytes, type } = read
	weight.bytes = bytes.byteLength
	if (type === null) return { kind: 'refused', reason: 'not a type the index stores' }
	// What the bytes are must agree with what the publisher said they are.
	if (entry.kind !== undefined && entry.kind !== type.kind) return { kind: 'refused', reason: `bytes are ${type.kind}` }
	if (bytes.byteLength > capFor(type.kind, services.caps)) return { kind: 'refused', reason: `over the ${type.kind} cap` }

	const sha256 = await digestOf(bytes)
	const known = await findMedia(services.sql, sha256)
	if (known?.blocked_at != null) return { kind: 'refused', reason: 'blocked' }

	const reused = known !== null && (await services.media.head(mediaKey(sha256))) !== null
	if (!reused) {
		await services.media.put(mediaKey(sha256), bytes, {
			contentType: type.type,
			cacheControl: IMMUTABLE,
			sourceUrl: entry.url,
		})
	}
	await recordMedia(services.sql, { sha256, bytes: bytes.byteLength, contentType: type.type, now: services.now() })

	let claimed = 0
	for (const target of message.targets) {
		const inserted = await attachMediaClaim(services.sql, {
			source: message.source,
			recordKey: target.recordKey,
			opid: target.opid,
			entry,
			sha256,
			now: services.now(),
		})
		if (inserted) claimed += 1
	}
	return { kind: 'stored', sha256, claimed, reused }
}

/** The cap for a kind. The spec gives an image 20 MiB and a document 50 MiB. */
function capFor(kind: 'image' | 'document', caps: { imageBytes: number; documentBytes_media: number }): number {
	return kind === 'document' ? caps.documentBytes_media : caps.imageBytes
}

/**
 * Reads the file, deciding what it is as soon as the leading bytes are in. An entry that declared no
 * `kind` gets the cap of what the bytes turn out to be rather than a guess made before reading: the
 * read starts under the larger cap and stops the moment it passes the one the sniffed kind allows.
 */
async function readCapped(
	stream: ReadableStream<Uint8Array>,
	entry: MediaEntry,
	caps: { imageBytes: number; documentBytes_media: number },
): Promise<{ bytes: Uint8Array; type: SniffedType | null }> {
	const reader = stream.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	let type: SniffedType | null = null
	let cap = entry.kind === undefined ? capFor('document', caps) : capFor(entry.kind, caps)

	try {
		for (;;) {
			const chunk = await reader.read()
			if (chunk.done) break
			chunks.push(chunk.value)
			total += chunk.value.byteLength
			if (type === null && total >= SNIFF_BYTES) {
				type = sniffMedia(join(chunks, total))
				if (type === null) break
				if (entry.kind === undefined) cap = capFor(type.kind, caps)
			}
			if (total > cap) break
		}
	} finally {
		await reader.cancel().catch(() => {})
	}

	const bytes = join(chunks, total)
	// A file shorter than the sniffing window still has to be decided.
	return { bytes, type: type ?? sniffMedia(bytes) }
}

function join(chunks: readonly Uint8Array[], total: number): Uint8Array {
	if (chunks.length === 1) return chunks[0]!
	const out = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.byteLength
	}
	return out
}

const HEX = Array.from({ length: 256 }, (_unused, byte) => byte.toString(16).padStart(2, '0'))

/**
 * The digest of a file's bytes. Core's `sha256Hex` hashes a string's UTF-8 encoding, which is the
 * wrong answer for bytes: anything above 0x7f would encode to two.
 */
async function digestOf(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
	let out = ''
	for (const byte of new Uint8Array(digest)) out += HEX[byte]!
	return out
}

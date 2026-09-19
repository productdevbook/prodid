import { checkFetchable, isPublicAddress, isRedirectAllowed } from '@prodid/core'

import type { Network, NetworkResponse } from './types'

export interface Caps {
	/** One DNS lookup. */
	dnsMs: number
	documentBytes: number
	documentMs: number
	feedBytes: number
	feedMs: number
	lineBytes: number
	/** One media file, per the spec: 20 MiB for an image, 50 MiB for a document, 60 s either way. */
	imageBytes: number
	documentBytes_media: number
	mediaMs: number
	/** Connect, TLS and first byte, inside whichever deadline the read is under. */
	firstByteMs: number
	/** How many media entries of one record are ingested; the rest are skipped, never the record. */
	mediaEntries: number
}

/**
 * The spec's caps, which the crawl structure is built to fit rather than the other way round: one
 * queue message reads one feed, so the longest invocation is one 10-minute feed inside the 15-minute
 * wall clock a Queue consumer gets, and the CPU that feed costs sits inside the `limits.cpu_ms` set
 * in `wrangler.jsonc`.
 */
export const DEFAULT_CAPS: Caps = {
	dnsMs: 5_000,
	documentBytes: 1_048_576,
	documentMs: 30_000,
	feedBytes: 268_435_456,
	feedMs: 600_000,
	lineBytes: 65_536,
	// Holding one file costs about twice its size, so a 50 MiB document peaks near 100 MiB inside a
	// 128 MB isolate. That is the reason a document is read one per message and nothing else runs
	// beside it.
	imageBytes: 20_971_520,
	documentBytes_media: 52_428_800,
	mediaMs: 60_000,
	firstByteMs: 10_000,
	mediaEntries: 20,
}

/**
 * `negative` is the host answering: the document is not there, or the crawler is not allowed to ask.
 * `transport` is the crawler learning nothing — a timeout, a 5xx, a cap. Only the first lapses a
 * source at once; the second has to persist for seven days.
 */
export interface FetchRequest {
	headers?: Record<string, string>
	/** The one deadline for this read, headers and body together. */
	deadline: AbortSignal
	/** How long the headers may take, inside that deadline. */
	firstByteMs?: number
}

export type FetchFailureKind = 'negative' | 'transport'

export type FetchOutcome =
	| { ok: true; url: string; status: number; headers: Headers; body: ReadableStream<Uint8Array> | null }
	| { ok: false; kind: FetchFailureKind; reason: string; status?: number }

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

export class CapExceeded extends Error {}

/**
 * The one way out of this Worker. Every rule the spec puts on a crawler fetch lives here: https on
 * the default port, a DNS name every one of whose addresses is public, at most one redirect under
 * core's policy, and a size and time cap on every byte read.
 *
 * The address check is re-done for every fetch and its answer is never kept: a name that resolved
 * publicly a minute ago is a name, not a promise. See `reachable` for what the check is and is not.
 */
export class GuardedFetcher {
	constructor(
		private readonly net: Network,
		private readonly caps: Caps,
	) {}

	async fetch(url: string, options: FetchRequest): Promise<FetchOutcome> {
		let target = url
		for (let hop = 0; hop < 2; hop += 1) {
			const attempt = await this.once(target, options)
			if (!attempt.ok) return attempt
			if (!REDIRECT_STATUS.has(attempt.status)) return attempt

			const location = attempt.headers.get('location')
			await attempt.body?.cancel().catch(() => {})
			if (location === null) return { ok: false, kind: 'negative', reason: 'redirect-without-location', status: attempt.status }
			if (hop === 1) return { ok: false, kind: 'negative', reason: 'too-many-redirects', status: attempt.status }

			const next = resolveLocation(target, location)
			if (next === null || !isRedirectAllowed(target, next)) {
				return { ok: false, kind: 'negative', reason: 'redirect-off-host', status: attempt.status }
			}
			target = next
		}
		return { ok: false, kind: 'negative', reason: 'too-many-redirects' }
	}

	/** Wraps a body in the size and time cap. The stream errors rather than growing past either. */
	limit(body: ReadableStream<Uint8Array>, maxBytes: number, signal: AbortSignal): ReadableStream<Uint8Array> {
		const reader = body.getReader()
		let seen = 0
		return new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const chunk = await Promise.race([reader.read(), rejectOnAbort(signal)])
					if (chunk.done) {
						controller.close()
						return
					}
					seen += chunk.value.byteLength
					if (seen > maxBytes) throw new CapExceeded(`body exceeds ${maxBytes} bytes`)
					controller.enqueue(chunk.value)
				} catch (error) {
					await reader.cancel().catch(() => {})
					controller.error(error)
				}
			},
			async cancel(reason) {
				await reader.cancel(reason).catch(() => {})
			},
		})
	}

	async readText(body: ReadableStream<Uint8Array>, maxBytes: number, signal: AbortSignal): Promise<string> {
		const reader = this.limit(body, maxBytes, signal).getReader()
		const parts: Uint8Array[] = []
		let total = 0
		for (;;) {
			const chunk = await reader.read()
			if (chunk.done) break
			parts.push(chunk.value)
			total += chunk.value.byteLength
		}
		const bytes = new Uint8Array(total)
		let offset = 0
		for (const part of parts) {
			bytes.set(part, offset)
			offset += part.byteLength
		}
		return new TextDecoder().decode(bytes)
	}

	private async once(url: string, options: FetchRequest): Promise<FetchOutcome> {
		const fetchable = checkFetchable(url)
		if (!fetchable.ok) return { ok: false, kind: 'negative', reason: fetchable.reason }

		const reach = await this.reachable(fetchable.host)
		if (reach !== 'ok') return reach

		let response: NetworkResponse
		try {
			response = await this.net.fetch({
				url,
				headers: { accept: 'application/json, application/x-ndjson, */*;q=0.1', ...options.headers },
				// Two signals for two phases of one deadline, not two deadlines: the headers have to
				// arrive inside the shorter of the first-byte cap and the deadline, and the body has
				// the rest of the deadline. The whole read is still bounded by `deadline`.
				signal:
					options.firstByteMs === undefined
						? options.deadline
						: AbortSignal.any([options.deadline, AbortSignal.timeout(options.firstByteMs)]),
			})
		} catch (error) {
			return { ok: false, kind: 'transport', reason: error instanceof Error ? error.name : 'fetch-failed' }
		}
		// 429 and 5xx say nothing about whether the document exists, so they must not lapse anyone.
		if (response.status === 429 || response.status >= 500) {
			await response.body?.cancel().catch(() => {})
			return { ok: false, kind: 'transport', reason: `status-${response.status}`, status: response.status }
		}
		return { ok: true, url, status: response.status, headers: response.headers, body: response.body }
	}

	/**
	 * Every address the name resolves to must be public — one private answer among public ones is a
	 * name that can be made to resolve privately, and the crawler does not choose which answer the
	 * connection takes.
	 *
	 * This check is the control, and it is not airtight: it resolves the name, and then `fetch`
	 * resolves it again. Cloudflare documents no guarantee that a Worker's global `fetch()` refuses
	 * private, loopback, link-local or metadata addresses. What it documents is narrower — error
	 * 1024, "Worker cannot make a subrequest to a Cloudflare-owned IP address", and error 1021,
	 * "Worker has requested a host it cannot access" — and Workers VPC exists precisely because
	 * reaching a private network otherwise needs an explicit binding. So the race is residual, and
	 * what bounds it is that the fetch is `https` to the name that was checked: an answer that wins
	 * the second resolution still has to present a certificate valid for that public hostname. The
	 * body is never handed back to whoever asked for the crawl, so nothing it returns is readable.
	 */
	private async reachable(host: string): Promise<'ok' | Extract<FetchOutcome, { ok: false }>> {
		const lookup = await this.net.resolveAddresses(host, this.caps.dnsMs)
		if (!lookup.ok) return { ok: false, kind: 'transport', reason: `dns-${lookup.reason}` }
		if (lookup.addresses.length === 0) return { ok: false, kind: 'negative', reason: 'no-address' }
		if (!lookup.addresses.every((address) => isPublicAddress(address))) {
			return { ok: false, kind: 'negative', reason: 'not-a-public-address' }
		}
		return 'ok'
	}
}

function resolveLocation(from: string, location: string): string | null {
	try {
		return new URL(location, from).toString()
	} catch {
		return null
	}
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
	return new Promise((_resolve, reject) => {
		if (signal.aborted) {
			reject(new CapExceeded('deadline reached'))
			return
		}
		signal.addEventListener('abort', () => reject(new CapExceeded('deadline reached')), { once: true })
	})
}

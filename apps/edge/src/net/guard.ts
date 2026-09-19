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
	maxFeeds: number
}

export const DEFAULT_CAPS: Caps = {
	dnsMs: 5_000,
	documentBytes: 1_048_576,
	documentMs: 30_000,
	feedBytes: 268_435_456,
	feedMs: 600_000,
	lineBytes: 65_536,
	maxFeeds: 100,
}

/**
 * `negative` is the host answering: the document is not there, or the crawler is not allowed to ask.
 * `transport` is the crawler learning nothing — a timeout, a 5xx, a cap. Only the first lapses a
 * source at once; the second has to persist for seven days.
 */
export type FetchFailureKind = 'negative' | 'transport'

export type FetchOutcome =
	| { ok: true; url: string; status: number; headers: Headers; body: ReadableStream<Uint8Array> | null }
	| { ok: false; kind: FetchFailureKind; reason: string; status?: number }

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

export class CapExceeded extends Error {}

/**
 * The one way out of this Worker. Every rule the spec puts on a crawler fetch lives here: https on
 * the default port, a DNS name that reaches a public address, at most one redirect and only to
 * `www.` of the same host with the same path, and a size and time cap on every byte read.
 */
export class GuardedFetcher {
	private readonly resolved = new Map<string, 'public' | 'blocked' | 'empty'>()

	constructor(
		private readonly net: Network,
		private readonly caps: Caps,
	) {}

	async fetch(url: string, options: { headers?: Record<string, string>; timeoutMs: number }): Promise<FetchOutcome> {
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
			if (next === null || !isRedirectAllowed(target, next) || !samePath(target, next)) {
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

	private async once(url: string, options: { headers?: Record<string, string>; timeoutMs: number }): Promise<FetchOutcome> {
		const fetchable = checkFetchable(url)
		if (!fetchable.ok) return { ok: false, kind: 'negative', reason: fetchable.reason }

		const reach = await this.reachable(fetchable.host)
		if (reach !== 'ok') return reach

		let response: NetworkResponse
		try {
			response = await this.net.fetch({
				url,
				headers: { accept: 'application/json, application/x-ndjson, */*;q=0.1', ...options.headers },
				signal: AbortSignal.timeout(options.timeoutMs),
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

	private async reachable(host: string): Promise<'ok' | Extract<FetchOutcome, { ok: false }>> {
		const cached = this.resolved.get(host)
		if (cached === 'public') return 'ok'
		if (cached === 'blocked') return { ok: false, kind: 'negative', reason: 'not-a-public-address' }
		if (cached === 'empty') return { ok: false, kind: 'negative', reason: 'no-address' }

		const lookup = await this.net.resolveAddresses(host, this.caps.dnsMs)
		if (!lookup.ok) return { ok: false, kind: 'transport', reason: `dns-${lookup.reason}` }
		if (lookup.addresses.length === 0) {
			this.resolved.set(host, 'empty')
			return { ok: false, kind: 'negative', reason: 'no-address' }
		}
		if (!lookup.addresses.some((address) => isPublicAddress(address))) {
			this.resolved.set(host, 'blocked')
			return { ok: false, kind: 'negative', reason: 'not-a-public-address' }
		}
		this.resolved.set(host, 'public')
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

/** The one permitted redirect keeps the path and the query; core's policy only rules on the host. */
function samePath(from: string, to: string): boolean {
	const left = new URL(from)
	const right = new URL(to)
	return left.pathname === right.pathname && left.search === right.search
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

import { acceptDiscovery, acceptsV0Discovery, type DiscoveryVia, type FeedRecord, planDiscovery, TXT_PREFIX } from '@prodid/core'
import type { FeedRow } from '@prodid/store'

import type { Decision } from '../limits/client'
import type { Caps, GuardedFetcher } from '../net/guard'
import type { Network } from '../net/types'

export type DiscoveryResult =
	| { kind: 'deferred'; retryAfterMs: number }
	| {
			kind: 'negative'
			outcome: 'no-discovery' | 'rejected'
			via: DiscoveryVia | null
			documentUrl: string | null
			status: number | null
			reason: string
	  }
	| { kind: 'transport'; via: DiscoveryVia | null; documentUrl: string | null; status: number | null; reason: string }
	| {
			kind: 'ok'
			via: DiscoveryVia
			documentUrl: string
			host: string
			delegated: boolean
			status: number
			etag: string | null
			lastModified: string | null
			/** Null when the host answered 304: the bytes are the ones already accepted for this source. */
			document: FeedRecord | null
			feeds: string[]
	  }

export interface DiscoveryInput {
	domain: string
	net: Network
	fetcher: GuardedFetcher
	caps: Caps
	/** The conditional-request state of this source, empty for a domain that is not a source yet. */
	feedState: Map<string, FeedRow>
	/** One fetch of the host the plan names, in whichever lane this source belongs to. */
	takeHost: (host: string) => Promise<Decision>
	/** Ask without validators: a source with nothing live has to be told everything again. */
	unconditional: boolean
	/** Feed URLs remembered from the last successful crawl, used when the document answers 304. */
	knownFeeds: (documentUrl: string) => string[]
	/** Decides whether a v0 document is still accepted. */
	crawlStartedAt: Date
}

/**
 * Discovery, from scratch, DNS first. Nothing about the path is remembered between crawls: a
 * delegation that was removed is gone here, not at the next cache expiry.
 */
export async function runDiscovery(input: DiscoveryInput): Promise<DiscoveryResult> {
	const txt = await input.net.resolveTxt(`${TXT_PREFIX}${input.domain}`, input.caps.dnsMs)
	if (!txt.ok) return { kind: 'transport', via: null, documentUrl: null, status: null, reason: `dns-${txt.reason}` }

	const plan = planDiscovery(input.domain, txt.records)
	if (!plan.ok) {
		return { kind: 'negative', outcome: 'no-discovery', via: null, documentUrl: null, status: null, reason: plan.reason }
	}

	const budget = await input.takeHost(plan.plan.host)
	if (!budget.ok) return { kind: 'deferred', retryAfterMs: budget.retryAfterMs }

	const url = plan.plan.documentUrl
	const via = plan.plan.via
	const previous = input.unconditional || mayBeV0(input, url) ? undefined : input.feedState.get(url)
	const deadline = AbortSignal.timeout(input.caps.documentMs)
	const response = await input.fetcher.fetch(url, {
		headers: conditional(previous),
		deadline,
		firstByteMs: input.caps.firstByteMs,
	})
	if (!response.ok) {
		const status = response.status ?? null
		if (response.kind === 'transport') return { kind: 'transport', via, documentUrl: url, status, reason: response.reason }
		return { kind: 'negative', outcome: 'rejected', via, documentUrl: url, status, reason: response.reason }
	}

	const etag = response.headers.get('etag')
	const lastModified = response.headers.get('last-modified')

	if (response.status === 304) {
		await response.body?.cancel().catch(() => {})
		const feeds = input.knownFeeds(url)
		if (feeds.length > 0) {
			return {
				kind: 'ok',
				via,
				documentUrl: url,
				host: plan.plan.host,
				delegated: plan.plan.delegated,
				status: 304,
				etag,
				lastModified,
				document: null,
				feeds,
			}
		}
		// A 304 with nothing remembered proves nothing; ask again without the validators.
		return await fetchAndAccept(input, plan.plan, url, via, {})
	}

	return await acceptResponse(input, plan.plan, url, via, response, etag, lastModified)
}

async function fetchAndAccept(
	input: DiscoveryInput,
	plan: { host: string; delegated: boolean },
	url: string,
	via: DiscoveryVia,
	headers: Record<string, string>,
): Promise<DiscoveryResult> {
	const response = await input.fetcher.fetch(url, {
		headers,
		deadline: AbortSignal.timeout(input.caps.documentMs),
		firstByteMs: input.caps.firstByteMs,
	})
	if (!response.ok) {
		const status = response.status ?? null
		if (response.kind === 'transport') return { kind: 'transport', via, documentUrl: url, status, reason: response.reason }
		return { kind: 'negative', outcome: 'rejected', via, documentUrl: url, status, reason: response.reason }
	}
	return await acceptResponse(input, plan, url, via, response, response.headers.get('etag'), response.headers.get('last-modified'))
}

async function acceptResponse(
	input: DiscoveryInput,
	plan: { host: string; delegated: boolean },
	url: string,
	via: DiscoveryVia,
	response: Extract<Awaited<ReturnType<GuardedFetcher['fetch']>>, { ok: true }>,
	etag: string | null,
	lastModified: string | null,
): Promise<DiscoveryResult> {
	let body: unknown
	if (response.body !== null) {
		try {
			const text = await input.fetcher.readText(response.body, input.caps.documentBytes, AbortSignal.timeout(input.caps.documentMs))
			body = JSON.parse(text)
		} catch (error) {
			const reason = error instanceof SyntaxError ? 'not-json' : 'document-cap'
			if (reason === 'not-json') {
				return { kind: 'negative', outcome: 'rejected', via, documentUrl: url, status: response.status, reason }
			}
			return { kind: 'transport', via, documentUrl: url, status: response.status, reason }
		}
	}

	const decision = acceptDiscovery({
		domain: input.domain,
		host: plan.host,
		delegated: plan.delegated,
		status: response.status,
		contentType: response.headers.get('content-type'),
		body,
		crawlStartedAt: input.crawlStartedAt,
	})
	if (!decision.ok) {
		return {
			kind: 'negative',
			outcome: 'rejected',
			via,
			documentUrl: url,
			status: response.status,
			reason: decision.detail === undefined ? decision.reason : `${decision.reason}: ${decision.detail}`,
		}
	}
	return {
		kind: 'ok',
		via,
		documentUrl: url,
		host: decision.host,
		delegated: decision.delegated,
		status: response.status,
		etag,
		lastModified,
		document: decision.document,
		feeds: decision.feeds,
	}
}

/**
 * The document state is saved with the start of the crawl that accepted it, so a state older than
 * the cut-off may stand for a v0 document that a 304 would carry past it.
 */
function mayBeV0(input: DiscoveryInput, url: string): boolean {
	if (acceptsV0Discovery(input.crawlStartedAt)) return false
	const accepted = input.feedState.get(url)?.last_fetched_at
	return accepted == null || acceptsV0Discovery(accepted)
}

export function conditional(state: FeedRow | undefined): Record<string, string> {
	const headers: Record<string, string> = {}
	if (state?.etag != null) headers['if-none-match'] = state.etag
	if (state?.last_modified != null) headers['if-modified-since'] = state.last_modified
	return headers
}

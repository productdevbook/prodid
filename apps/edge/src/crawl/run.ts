import { normalizeDomain, registrableDomain } from '@prodid/core'
import {
	countVerifiedSourcesAtHost,
	type CrawlOutcome,
	type Disagreement,
	type FeedRow,
	findOrCreateSource,
	findSourceByName,
	finishCrawl,
	readFeedStates,
	recordVerification,
	saveFeedState,
	setSourceLicense,
	SKIPPING_GRACE_MS,
	type SourceRow,
	sourcesDueForCrawl,
	startCrawl,
	upgradeSourceIdentity,
	withdrawAbsentRecords,
} from '@prodid/store'

import type { Decision } from '../limits/client'
import { GuardedFetcher } from '../net/guard'
import type { Services } from '../services'
import { conditional, runDiscovery } from './discovery'
import { type FeedRead, readFeed } from './feeds'

export type CrawlRun =
	| { kind: 'deferred'; retryAfterMs: number }
	| { kind: 'ignored'; reason: string }
	| { kind: 'done'; outcome: CrawlOutcome; source: string; crawl: string }

/**
 * One crawl of one domain, from DNS to the last claim. Every limit is taken before the thing it
 * guards, and a limit saying no is a deferral: no crawl row, no outcome, no lapse.
 */
export async function runCrawl(services: Services, domain: string): Promise<CrawlRun> {
	const name = normalizeDomain(domain)
	if (name === null) return { kind: 'ignored', reason: 'not-a-domain' }

	const startedAt = services.now()
	const gate = await services.limits.domainGate(name, startedAt)
	if (!gate.ok) return { kind: 'deferred', retryAfterMs: gate.retryAfterMs }

	let source = await findSourceByName(services.sql, name)
	if (source === null) {
		const registrable = registrableDomain(name) ?? name
		const contact = await services.limits.firstContact(registrable, startedAt)
		if (!contact.ok) return { kind: 'deferred', retryAfterMs: contact.retryAfterMs }
	}

	const feedState: Map<string, FeedRow> = source === null ? new Map() : await readFeedStates(services.sql, source.id)
	const fetcher = new GuardedFetcher(services.net, services.caps)
	const discovery = await runDiscovery({
		domain: name,
		net: services.net,
		fetcher,
		caps: services.caps,
		feedState,
		takeHost: (host) => takeHostBudget(services, host, source !== null && isVerifiedAt(source, host)),
		knownFeeds: (documentUrl) => [...feedState.keys()].filter((url) => url !== documentUrl),
	})

	if (discovery.kind === 'deferred') return { kind: 'deferred', retryAfterMs: discovery.retryAfterMs }

	if (discovery.kind !== 'ok') {
		// Nothing is stored about a domain that has never published an acceptable document: no row,
		// and /source/{name} is a 404 that cannot be told apart from a name nobody ever pinged.
		if (source === null) return { kind: 'ignored', reason: discovery.reason }
		const crawl = await startCrawl(services.sql, {
			source: source.id,
			via: discovery.via,
			documentUrl: discovery.documentUrl,
			startedAt,
		})
		const outcome: CrawlOutcome = discovery.kind === 'negative' ? discovery.outcome : 'fetch-failed'
		await finishCrawl(services.sql, {
			crawl,
			source: source.id,
			outcome,
			httpStatus: statusFor(outcome, discovery.status),
			error: discovery.reason,
			finishedAt: services.now(),
		})
		return { kind: 'done', outcome, source: source.id, crawl }
	}

	const upgraded = source === null && discovery.delegated ? await adoptHostedSlug(services, discovery.host) : null
	source ??= upgraded ?? (await findOrCreateSource(services.sql, { kind: 'domain', name }, startedAt))

	const crawl = await startCrawl(services.sql, {
		source: source.id,
		via: discovery.via,
		documentUrl: discovery.documentUrl,
		startedAt,
	})

	const feeds = await readFeeds(services, source, discovery.feeds, discovery.host, feedState, startedAt)
	if (feeds.kind === 'deferred') return { kind: 'deferred', retryAfterMs: feeds.retryAfterMs }

	await saveFeedState(services.sql, {
		source: source.id,
		url: discovery.documentUrl,
		etag: discovery.etag,
		lastModified: discovery.lastModified,
		status: discovery.status,
		skippedLines: 0,
		at: startedAt,
	})
	if (discovery.document !== null) await setSourceLicense(services.sql, source.id, discovery.document.license)

	let withdrawn = 0
	if (feeds.complete && !feeds.withinSkipGrace) {
		const result = await withdrawAbsentRecords(services.sql, { source: source.id, seenKeys: feeds.keys, now: services.now() })
		withdrawn = result.records
	}

	const outcome = outcomeFor(feeds, withdrawn)
	await finishCrawl(services.sql, {
		crawl,
		source: source.id,
		outcome,
		httpStatus: statusFor(outcome, discovery.status),
		recordsSeen: feeds.seen,
		recordsChanged: feeds.changed,
		linesSkipped: feeds.skipped,
		error: noteFor(feeds.disagreements),
		finishedAt: services.now(),
	})

	if (outcome === 'changed' || outcome === 'unchanged') {
		// A hosted slug serving its own document proves nothing about a domain, so it stays
		// unverified; the proof triple is written only for a source whose identity is a domain.
		const feedHost = discovery.host === name ? null : discovery.host
		if (upgraded !== null) {
			await upgradeSourceIdentity(services.sql, {
				source: upgraded.id,
				name,
				kind: 'domain',
				verifiedBy: discovery.via,
				crawl,
				feedHost,
				verifiedAt: services.now(),
			})
		} else if (source.kind === 'domain') {
			await recordVerification(services.sql, {
				source: source.id,
				verifiedBy: discovery.via,
				crawl,
				feedHost,
				verifiedAt: services.now(),
			})
		}
	}

	return { kind: 'done', outcome, source: source.id, crawl }
}

interface FeedsSummary {
	kind: 'read'
	keys: string[]
	seen: number
	changed: number
	skipped: number
	claimsInserted: number
	claimsWithdrawn: number
	failed: number
	/** Every feed the document lists answered with a body this crawl read in full. */
	complete: boolean
	withinSkipGrace: boolean
	disagreements: Disagreement[]
}

async function readFeeds(
	services: Services,
	source: SourceRow,
	urls: readonly string[],
	host: string,
	feedState: Map<string, FeedRow>,
	startedAt: Date,
): Promise<FeedsSummary | { kind: 'deferred'; retryAfterMs: number }> {
	const summary: FeedsSummary = {
		kind: 'read',
		keys: [],
		seen: 0,
		changed: 0,
		skipped: 0,
		claimsInserted: 0,
		claimsWithdrawn: 0,
		failed: 0,
		complete: true,
		withinSkipGrace: false,
		disagreements: [],
	}
	const verified = isVerifiedAt(source, host) && source.trust !== 'unverified'
	const keys = new Set<string>()
	const notModified: string[] = []
	let readAny = false

	for (const url of urls) {
		const budget = await takeHostBudget(services, host, verified)
		if (!budget.ok) return { kind: 'deferred', retryAfterMs: budget.retryAfterMs }
		const read = await fetchOne(services, source, url, conditional(feedState.get(url)))
		await saveFeedResult(services, source.id, url, read, startedAt)
		absorb(summary, keys, url, read, feedState, startedAt)
		if (read.kind === 'not-modified') notModified.push(url)
		if (read.kind === 'read') readAny = true
	}

	// A feed that answered 304 is byte-identical to the last full read, but `record` carries no feed
	// so its keys cannot be told from another's. When anything else was re-read, read those again in
	// full: that is what makes the set of present keys exact, and withdrawal with it.
	if (notModified.length > 0 && readAny && summary.failed === 0) {
		for (const url of notModified) {
			const budget = await takeHostBudget(services, host, verified)
			if (!budget.ok) return { kind: 'deferred', retryAfterMs: budget.retryAfterMs }
			const again = await fetchOne(services, source, url, {})
			await saveFeedResult(services, source.id, url, again, startedAt)
			absorb(summary, keys, url, again, feedState, startedAt)
		}
	} else if (notModified.length > 0) {
		summary.complete = false
	}

	summary.keys = [...keys]
	return summary
}

function fetchOne(services: Services, source: SourceRow, url: string, headers: Record<string, string>): Promise<FeedRead> {
	return readFeed({
		sql: services.sql,
		fetcher: new GuardedFetcher(services.net, services.caps),
		caps: services.caps,
		source: source.id,
		url,
		headers,
		now: services.now(),
	})
}

function absorb(
	summary: FeedsSummary,
	keys: Set<string>,
	url: string,
	read: FeedRead,
	feedState: Map<string, FeedRow>,
	startedAt: Date,
): void {
	if (read.kind === 'deferred') return
	if (read.kind === 'failed') {
		summary.failed += 1
		summary.complete = false
		return
	}
	if (read.kind === 'not-modified') return
	summary.seen += read.seen
	summary.changed += read.changed
	summary.skipped += read.skipped
	summary.claimsInserted += read.claimsInserted
	summary.claimsWithdrawn += read.claimsWithdrawn
	summary.disagreements.push(...read.disagreements)
	for (const key of read.keys) keys.add(key)
	if (read.skipped > 0) {
		const since = feedState.get(url)?.skipping_since ?? startedAt
		if (since.getTime() > startedAt.getTime() - SKIPPING_GRACE_MS) summary.withinSkipGrace = true
	}
}

/** The feed state is saved for every URL this crawl touched, so the next one can ask conditionally. */
async function saveFeedResult(services: Services, source: string, url: string, read: FeedRead, at: Date): Promise<void> {
	if (read.kind === 'deferred') return
	await saveFeedState(services.sql, {
		source,
		url,
		etag: read.kind === 'failed' ? null : read.etag,
		lastModified: read.kind === 'failed' ? null : read.lastModified,
		status: read.status,
		skippedLines: read.kind === 'read' ? read.skipped : 0,
		at,
	})
}

/**
 * A domain's first verified delegation to a host that is itself a hosted slug moves that row to the
 * domain. Only a slug that has never proven anything of its own qualifies: anything else would let a
 * stranger's TXT record take over a source that already has an identity.
 */
async function adoptHostedSlug(services: Services, host: string): Promise<SourceRow | null> {
	const hosted = await findSourceByName(services.sql, host)
	if (hosted === null || hosted.kind !== 'hosted' || hosted.trust !== 'unverified') return null
	return hosted
}

async function takeHostBudget(services: Services, host: string, verified: boolean): Promise<Decision> {
	const decision = await services.limits.hostFetch(host, verified, services.now())
	if (decision.needsCount) {
		const count = await countVerifiedSourcesAtHost(services.sql, host)
		await services.limits.reportVerifiedSources(host, count, services.now())
	}
	return decision
}

function isVerifiedAt(source: SourceRow, host: string): boolean {
	return (source.feed_host ?? source.name) === host
}

function outcomeFor(feeds: FeedsSummary, withdrawn: number): CrawlOutcome {
	if (feeds.failed > 0) return 'fetch-failed'
	const changed = feeds.changed > 0 || feeds.claimsInserted > 0 || feeds.claimsWithdrawn > 0 || withdrawn > 0
	return changed ? 'changed' : 'unchanged'
}

function statusFor(outcome: CrawlOutcome, status: number | null): number | null {
	if (status === null) return null
	// A transport failure may only publish a status that concludes nothing; a cap reached behind a
	// 200 is not one of them.
	if (outcome === 'fetch-failed') return status === 429 || status >= 500 ? status : null
	return status
}

function noteFor(disagreements: readonly Disagreement[]): string | null {
	if (disagreements.length === 0) return null
	return disagreements
		.slice(0, 20)
		.map((entry) => `identifier disagreement on ${entry.key}: chose ${entry.chosen}, also saw ${entry.others.join(' ')}`)
		.join('; ')
}

export async function enqueueDueSources(services: Services, limit = 500): Promise<number> {
	const now = services.now()
	const due = await sourcesDueForCrawl(services.sql, { now, intervalMs: services.crawlIntervalMs, limit })
	if (due.length === 0) return 0
	await services.queue.sendBatch(due.map((source) => ({ domain: source.name })))
	return due.length
}

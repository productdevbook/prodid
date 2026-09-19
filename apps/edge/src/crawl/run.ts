import { normalizeDomain, registrableDomain } from '@prodid/core'
import {
	accumulateCrawl,
	countVerifiedSourcesAtHost,
	hasLiveRecords,
	isCrawlOpen,
	retireAbsentFeeds,
	type CrawlOutcome,
	type Disagreement,
	ensureFeeds,
	type FeedRow,
	findOrCreateSource,
	findSourceById,
	findSourceByName,
	finishCrawl,
	readFeedStates,
	recordVerification,
	saveFeedState,
	setSourceLicense,
	SKIPPING_GRACE_MS,
	type MediaWanted,
	type SourceRow,
	startCrawl,
	upgradeSourceIdentity,
	withdrawAbsentRecords,
} from '@prodid/store'

import type { Decision } from '../limits/client'
import { POLICY } from '../limits/policy'
import { GuardedFetcher } from '../net/guard'
import { type CrawlMessage, type CrawlPlan, type MediaMessage, type Services, sourceKindFor } from '../services'
import { conditional, runDiscovery } from './discovery'
import { type FeedRead, readFeed } from './feeds'

export type CrawlStep =
	| { kind: 'deferred'; retryAfterMs: number }
	| { kind: 'ignored'; reason: string }
	| { kind: 'continued' }
	| { kind: 'done'; outcome: CrawlOutcome; source: string; crawl: string }

/** One definition of the lane, used both to pick it and to decide who gets the benefit of the doubt. */
export function verifiedAtHost(source: SourceRow | null, host: string): boolean {
	return source !== null && source.trust !== 'unverified' && (source.feed_host ?? source.name) === host
}

/**
 * Discovery for one domain: DNS, the document, and the decision whether anything is written at all.
 * Every limit is taken before the thing it guards, and a limit saying no is a deferral — no crawl
 * row, no outcome, no lapse.
 */
export async function runDiscover(services: Services, domain: string): Promise<CrawlStep> {
	const name = normalizeDomain(domain)
	if (name === null) return { kind: 'ignored', reason: 'not-a-domain' }

	const startedAt = services.now()
	const zone = registrableDomain(name) ?? name
	const gate = await services.limits.domainGate(name, startedAt)
	if (!gate.ok) return { kind: 'deferred', retryAfterMs: gate.retryAfterMs }

	let source = await findSourceByName(services.sql, name)
	if (source === null) {
		const contact = await services.limits.firstContact(zone, startedAt)
		if (!contact.ok) return { kind: 'deferred', retryAfterMs: contact.retryAfterMs }
	}

	const feedState: Map<string, FeedRow> = source === null ? new Map() : await readFeedStates(services.sql, source.id)
	// A source with nothing live, and any source recovering from a lapse, is read without
	// validators: its ETags survived the outage, and a publisher serving unchanged bytes would
	// otherwise answer 304 forever and never re-assert the catalogue that was withdrawn.
	const unconditional = source === null || source.lapsed_at !== null || !(await hasLiveRecords(services.sql, source.id))
	const discovery = await runDiscovery({
		domain: name,
		net: services.net,
		fetcher: new GuardedFetcher(services.net, services.caps),
		caps: services.caps,
		feedState,
		takeHost: (host) => takeHostBudget(services, host, verifiedAtHost(source, host), zone),
		unconditional,
		knownFeeds: (documentUrl) =>
			[...feedState.values()].filter((row) => row.url !== documentUrl && row.retired_at === null).map((row) => row.url),
	})

	if (discovery.kind === 'deferred') return { kind: 'deferred', retryAfterMs: discovery.retryAfterMs }

	if (discovery.kind !== 'ok') {
		// Nothing is stored about a domain that has never published an acceptable document: no row,
		// and /source/{name} is a 404 that cannot be told apart from a name nobody ever pinged.
		if (source === null) return { kind: 'ignored', reason: discovery.reason }
		const host = discovery.documentUrl === null ? '' : hostOf(discovery.documentUrl)
		const outcome = failureOutcome(discovery.kind, verifiedAtHost(source, host))
		const crawl = await startCrawl(services.sql, {
			source: source.id,
			via: discovery.via,
			documentUrl: discovery.documentUrl,
			startedAt,
		})
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

	const upgrade = source === null && discovery.delegated ? await adoptHostedSlug(services, discovery.host) : null
	source ??= upgrade ?? (await findOrCreateSource(services.sql, { kind: sourceKindFor(name, services.hostingZone), name }, startedAt))

	const crawl = await startCrawl(services.sql, {
		source: source.id,
		via: discovery.via,
		documentUrl: discovery.documentUrl,
		startedAt,
	})
	await ensureFeeds(services.sql, source.id, [discovery.documentUrl, ...discovery.feeds])
	// Only a document that was read may retire anything: a 304 says the list did not change.
	let retired = 0
	if (discovery.document !== null) {
		const result = await retireAbsentFeeds(services.sql, {
			source: source.id,
			keep: [discovery.documentUrl, ...discovery.feeds],
			now: services.now(),
		})
		retired = result.records
	}
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

	const plan: CrawlPlan = {
		domain: name,
		source: source.id,
		crawl,
		host: discovery.host,
		via: discovery.via,
		documentUrl: discovery.documentUrl,
		status: discovery.status,
		feeds: discovery.feeds,
		zone,
		upgrade: upgrade === null ? null : upgrade.id,
		startedAt: startedAt.toISOString(),
	}
	// Retiring a feed withdraws records, which is a change this crawl made.
	await services.queue.send(nextStep(plan, 0, retired > 0))
	return { kind: 'continued' }
}

/** One feed, one message: the longest thing this Worker ever does is read one file. */
export async function runFeedStep(services: Services, plan: CrawlPlan, at: number, touched = false): Promise<CrawlStep> {
	const url = plan.feeds[at]
	if (url === undefined) return await runFinalize(services, plan, touched)

	// The plan is a message, and a message outlives the moment it was written. Everything that
	// decides whether this step may write is read again from the database, here and not in
	// `discover`: the sweep may have closed this crawl and the source may have lapsed since.
	const state = await stateFor(services, plan)
	if (state === null) return { kind: 'ignored', reason: 'crawl is no longer open' }

	const budget = await takeHostBudget(services, plan.host, state.verified, plan.zone)
	if (!budget.ok) return { kind: 'deferred', retryAfterMs: budget.retryAfterMs }

	const feedState = await readFeedStates(services.sql, plan.source)
	// A feed retired since the plan was written is not fetched and is not a failed feed.
	if (feedState.get(url)?.retired_at != null) {
		await services.queue.send(nextStep(plan, at + 1, touched))
		return { kind: 'continued' }
	}
	// Queues deliver at least once. A feed already read during this crawl is not read again: its
	// counters are on the crawl row, and adding to them twice would report what never happened.
	const already = feedState.get(url)?.last_fetched_at
	if (already != null && already.getTime() >= Date.parse(plan.startedAt)) {
		await services.queue.send(nextStep(plan, at + 1, touched))
		return { kind: 'continued' }
	}

	const now = services.now()
	const read = await readFeed({
		sql: services.sql,
		fetcher: new GuardedFetcher(services.net, services.caps),
		caps: services.caps,
		source: plan.source,
		url,
		headers: state.unconditional ? {} : conditional(feedState.get(url)),
		now,
		// A probe reads the feed to prove it can be read; nothing it finds is written.
		ingest: !state.probe,
	})

	if (read.kind === 'read' && read.media.length > 0) {
		// A file that cannot be fetched must never fail the record or the crawl, so it is its own
		// message on its own queue from here — one per file, carrying every record that named it.
		await services.mediaQueue.sendBatch(groupMedia(plan, read.media))
	}

	await saveFeedResult(services, plan.source, url, read, now)
	await accumulateCrawl(services.sql, {
		crawl: plan.crawl,
		recordsSeen: read.kind === 'read' ? read.seen : 0,
		recordsChanged: read.kind === 'read' ? read.changed : 0,
		linesSkipped: read.kind === 'read' ? read.skipped : 0,
		feedsFailed: read.kind === 'failed' ? 1 : 0,
		conflicts: read.kind === 'read' ? read.disagreements.map(note) : [],
	})

	let changed = touched || (read.kind === 'read' && read.changed > 0)
	// A feed that answered 304 is byte-identical to the last full read, so nothing in it went away.
	// Only a feed this crawl read in full decides what is absent, and only within itself.
	if (read.kind === 'read' && !state.probe && !withinSkipGrace(read, feedState.get(url), now)) {
		const gone = await withdrawAbsentRecords(services.sql, {
			source: plan.source,
			feed: url,
			seenKeys: read.keys,
			now: services.now(),
		})
		changed = changed || gone.records > 0
	}

	await services.queue.send(nextStep(plan, at + 1, changed))
	return { kind: 'continued' }
}

/** The crawl's outcome, written once, from the counters every feed added to. */
export async function runFinalize(services: Services, plan: CrawlPlan, touched = false): Promise<CrawlStep> {
	const state = await stateFor(services, plan)
	if (state === null) return { kind: 'ignored', reason: 'crawl already finished' }

	const counts = await services.sql<{ feeds_failed: number | null }[]>`
		select feeds_failed from crawl where id = ${plan.crawl} and finished_at is null
	`
	const row = counts[0]
	if (row === undefined) return { kind: 'ignored', reason: 'crawl already finished' }

	const failed = row.feeds_failed ?? 0
	const outcome: CrawlOutcome = failed > 0 ? failureOutcome('transport', state.verified) : touched ? 'changed' : 'unchanged'

	await finishCrawl(services.sql, {
		crawl: plan.crawl,
		source: plan.source,
		outcome,
		httpStatus: statusFor(outcome, plan.status),
		finishedAt: services.now(),
	})

	if (outcome === 'changed' || outcome === 'unchanged') {
		const feedHost = plan.host === plan.domain ? null : plan.host
		if (plan.upgrade !== null) {
			await upgradeSourceIdentity(services.sql, {
				source: plan.upgrade,
				name: plan.domain,
				kind: 'domain',
				verifiedBy: plan.via,
				crawl: plan.crawl,
				feedHost,
				verifiedAt: services.now(),
			})
		} else {
			// A hosted slug serving its own document proves control of a slug, not of a domain, so
			// the proof triple is written only for a source whose identity is a domain.
			const source = await findSourceById(services.sql, plan.source)
			if (source?.kind === 'domain') {
				await recordVerification(services.sql, {
					source: plan.source,
					verifiedBy: plan.via,
					crawl: plan.crawl,
					feedHost,
					verifiedAt: services.now(),
				})
			}
		}

		// The lapse is cleared by the finished crawl; the source is ingested by the next one, which
		// is asked for as soon as the per-domain window allows.
		if (state.probe) {
			await services.queue.send({ kind: 'discover', domain: plan.domain }, { delaySeconds: Math.ceil(POLICY.domainWindowMs / 1000) })
		}
	}

	return { kind: 'done', outcome, source: plan.source, crawl: plan.crawl }
}

interface StepState {
	probe: boolean
	verified: boolean
	unconditional: boolean
}

/**
 * What the database says right now about whether this step may write, and in which lane. The plan
 * travels in a message, and a message outlives the moment it was written: the sweep may have closed
 * this crawl and the sweep may have lapsed this source since the plan was made.
 */
async function stateFor(services: Services, plan: CrawlPlan): Promise<StepState | null> {
	if (!(await isCrawlOpen(services.sql, plan.crawl))) return null
	const source = await findSourceById(services.sql, plan.source)
	if (source === null) return null
	return {
		probe: source.lapsed_at !== null,
		verified: verifiedAtHost(source, plan.host),
		unconditional: source.lapsed_at !== null || !(await hasLiveRecords(services.sql, plan.source)),
	}
}

/** One message per file: the same URL under the same licence is read once, however many records name it. */
function groupMedia(plan: CrawlPlan, wanted: readonly MediaWanted[]): MediaMessage[] {
	const byFile = new Map<string, MediaMessage>()
	for (const entry of wanted) {
		const key = `${entry.entry.url}\u0000${entry.entry.license}\u0000${entry.entry.kind ?? ''}`
		const existing = byFile.get(key)
		if (existing === undefined) {
			byFile.set(key, {
				source: plan.source,
				crawl: plan.crawl,
				targets: [{ recordKey: entry.key, opid: entry.opid }],
				entry: entry.entry,
				zone: plan.zone,
				recheck: entry.recheck,
			})
			continue
		}
		existing.targets.push({ recordKey: entry.key, opid: entry.opid })
		// A file any record still needs fetched for the first time is not a re-check.
		if (!entry.recheck) existing.recheck = false
	}
	return [...byFile.values()]
}

function nextStep(plan: CrawlPlan, at: number, touched: boolean): CrawlMessage {
	return at < plan.feeds.length ? { kind: 'feed', plan, at, touched } : { kind: 'finalize', plan, touched }
}

function note(entry: Disagreement): { key: string; chosen: string; others: string[] } {
	return { key: entry.key, chosen: entry.chosen, others: entry.others }
}

function withinSkipGrace(read: Extract<FeedRead, { kind: 'read' }>, state: FeedRow | undefined, now: Date): boolean {
	if (read.skipped === 0) return false
	const since = state?.skipping_since ?? now
	return since.getTime() > now.getTime() - SKIPPING_GRACE_MS
}

async function saveFeedResult(services: Services, source: string, url: string, read: FeedRead, at: Date): Promise<void> {
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

async function takeHostBudget(services: Services, host: string, verified: boolean, zone: string): Promise<Decision> {
	const decision = await services.limits.hostFetch(host, verified, services.now(), zone)
	if (decision.needsCount) {
		const count = await countVerifiedSourcesAtHost(services.sql, host)
		await services.limits.reportVerifiedSources(host, count, services.now())
	}
	return decision
}

/**
 * A source gets the benefit of the doubt only at a host it has been verified at. Anywhere else a
 * timeout and a 404 are the same answer, so the status page can never be read for how somebody
 * else's host treats the crawler, and neither can the lapse timing.
 */
function failureOutcome(kind: 'negative' | 'transport', verified: boolean): CrawlOutcome {
	if (kind === 'negative') return 'rejected'
	return verified ? 'fetch-failed' : 'rejected'
}

function statusFor(outcome: CrawlOutcome, status: number | null): number | null {
	if (status === null) return null
	// A transport failure may only publish a status that concludes nothing; a cap reached behind a
	// 200 is not one of them.
	if (outcome === 'fetch-failed') return status === 429 || status >= 500 ? status : null
	return status
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname
	} catch {
		return ''
	}
}

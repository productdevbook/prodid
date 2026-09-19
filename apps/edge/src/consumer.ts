import { countMediaFailure, finalizeStaleCrawls, lapseSweep, QUEUE_LEASE_MS, touchMediaClaim } from '@prodid/store'

import { type CrawlStep, runDiscover, runFeedStep, runFinalize } from './crawl/run'
import { POLICY } from './limits/policy'
import { runMediaStep } from './media/ingest'
import { claimDueSources } from './schedule'
import type { CrawlMessage, MediaMessage, Services } from './services'

/** A limiter that cannot be reached is the crawler's own limit saying no, not the publisher failing. */
export class LimiterUnavailable extends Error {}

/**
 * One message, one unit of work. A crawl held back by the crawler's own limits is acknowledged and
 * sent again with the delay the limit asked for, so it never counts against the queue's retries and
 * never reaches a dead letter queue for being early. Past the cap it is not dropped: it goes to the
 * dead letter queue with the reason, where an operator can see it.
 */
export async function consumeCrawl(services: Services, message: CrawlMessage): Promise<CrawlStep> {
	let result: CrawlStep
	try {
		result = await step(services, message)
	} catch (error) {
		if (!isLimiterFailure(error)) throw error
		// Failing closed is right; dead-lettering the crawl for it is not.
		result = { kind: 'deferred', retryAfterMs: POLICY.limiterOutageMs }
	}
	if (result.kind !== 'deferred') return result

	const deferrals = (message.deferrals ?? 0) + 1
	if (deferrals > POLICY.maxDeferrals) {
		const reason = `held back by the crawler's own limits ${deferrals} times`
		console.warn('crawl deferred past the cap', describe(message), reason)
		await services.dead.send(message, reason)
		return result
	}
	const delaySeconds = Math.min(POLICY.maxDeferralSeconds, Math.max(1, Math.ceil(result.retryAfterMs / 1000)))
	await services.queue.send({ ...message, deferrals }, { delaySeconds })
	return result
}

function step(services: Services, message: CrawlMessage): Promise<CrawlStep> {
	switch (message.kind) {
		case 'discover':
			return runDiscover(services, message.domain)
		case 'feed':
			return runFeedStep(services, message.plan, message.at, message.touched ?? false)
		case 'finalize':
			return runFinalize(services, message.plan, message.touched ?? false)
	}
}

function describe(message: CrawlMessage): string {
	return message.kind === 'discover' ? message.domain : `${message.plan.domain} (${message.kind})`
}

function isLimiterFailure(error: unknown): boolean {
	if (error instanceof LimiterUnavailable) return true
	// A Durable Object that cannot be reached surfaces as a plain runtime error; the crawl is held
	// back by it just the same.
	const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
	return /durable object|internal error|network connection lost|cannot reach/i.test(text)
}

/**
 * A file held back by the per-host budget comes back later; anything else about it is final. A
 * refusal or a failure is logged and dropped: the record keeps its other claims, and the crawl that
 * found the file has long since finished.
 */
export async function consumeMedia(services: Services, message: MediaMessage): Promise<void> {
	let result
	try {
		result = await runMediaStep(services, message)
	} catch (error) {
		if (!isLimiterFailure(error)) throw error
		result = { kind: 'deferred' as const, retryAfterMs: POLICY.limiterOutageMs }
	}
	if (result.kind === 'deferred') {
		const deferrals = (message.deferrals ?? 0) + 1
		if (deferrals > POLICY.maxDeferrals) {
			console.warn('media deferred past the cap', message.entry.url, message.source)
			return
		}
		const delaySeconds = Math.min(POLICY.maxDeferralSeconds, Math.max(1, Math.ceil(result.retryAfterMs / 1000)))
		await services.mediaQueue.send({ ...message, deferrals }, { delaySeconds })
		return
	}
	if (result.kind === 'stored') return

	console.warn('media not stored', result.kind, result.reason, message.entry.url)
	if (message.recheck === true) {
		// A re-check that could not be done says nothing about the publisher's catalogue: the claim
		// stands, the file is still served, and nothing they can act on has changed. Counting it in
		// `media_failed` would report a fault against a file the index already holds. The stamp moves
		// anyway, or a dead URL would be re-fetched by every crawl from day thirty onwards.
		for (const target of message.targets) {
			await touchMediaClaim(services.sql, {
				source: message.source,
				recordKey: target.recordKey,
				opid: target.opid,
				url: message.entry.url,
				now: services.now(),
			})
		}
		return
	}
	// The publisher learns one bit per entry — whether a claim appeared — and a number per crawl.
	for (const _target of message.targets) await countMediaFailure(services.sql, message.crawl)
}

/** The dead letter queue's consumer: a structured line an operator can find and re-drive by hand. */
export function consumeDeadLetter(letter: { reason: string; message: CrawlMessage }): void {
	console.warn(
		JSON.stringify({
			event: 'crawl.dead-letter',
			reason: letter.reason,
			domain: letter.message.kind === 'discover' ? letter.message.domain : letter.message.plan.domain,
			step: letter.message.kind,
			crawl: letter.message.kind === 'discover' ? null : letter.message.plan.crawl,
			deferrals: letter.message.deferrals ?? 0,
		}),
	)
}

export async function runScheduled(services: Services): Promise<void> {
	await claimDueSources(services)
	await finalizeStaleCrawls(services.sql, { now: services.now(), olderThanMs: QUEUE_LEASE_MS })
	await lapseSweep(services.sql, { now: services.now() })
}

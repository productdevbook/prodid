import { sha256Hex } from '@prodid/core'
import { countMediaFailure, finalizeStaleCrawls, lapseSweep, QUEUE_LEASE_MS, touchMediaClaim } from '@prodid/store'

import { type CrawlStep, runDiscover, runFeedStep, runFinalize } from './crawl/run'
import { POLICY } from './limits/policy'
import { runMediaStep } from './media/ingest'
import { consumeNotify, consumeNotifyDeadLetter, enqueueNotices } from './notify'
import { claimDueSources } from './schedule'
import type { CrawlDeadLetter, CrawlMessage, MediaDeadLetter, MediaMessage, NotifyMessage, Services } from './services'
import { DEAD_LETTER_QUEUES, recoverStatus, reportDeadLetters } from './status'

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
 * A file held back by the per-host budget comes back later, and past the cap goes to the dead letter
 * queue with the reason; anything else about it is final. A refusal or a failure is logged and
 * dropped: the record keeps its other claims, and the crawl that found the file has long since
 * finished.
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
			await services.mediaDead.send({ ...message, deferrals }, `held back by the crawler's own limits ${deferrals} times`)
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

/**
 * `prodid-crawl-dlq` holds two shapes: a letter the consumer sent with its reason, and a bare message
 * the queue moved there after its retries ran out. Either is one structured line an operator can
 * find and re-drive by hand.
 */
export function consumeDeadLetter(body: CrawlDeadLetter | CrawlMessage): void {
	const letter: CrawlDeadLetter = 'reason' in body ? body : { reason: 'failed on every retry of prodid-crawl', message: body }
	const message = letter.message
	const plan = message?.kind === 'discover' ? undefined : message?.plan
	console.warn(
		JSON.stringify({
			event: 'crawl.dead-letter',
			reason: letter.reason,
			domain: (message?.kind === 'discover' ? message.domain : plan?.domain) ?? null,
			step: message?.kind ?? null,
			crawl: plan?.crawl ?? null,
			deferrals: message?.deferrals ?? 0,
		}),
	)
}

/**
 * `prodid-media-dlq` holds two shapes: a letter the consumer sent with its reason, and a bare message
 * the queue moved there after its retries ran out. The URL is a publisher's and is logged by digest.
 * A dead-lettered entry is retried on the next crawl of its record, like any other failed entry.
 */
export async function consumeMediaDeadLetter(body: MediaDeadLetter | MediaMessage): Promise<void> {
	const letter: MediaDeadLetter = 'reason' in body ? body : { reason: 'failed on every retry of prodid-media-ingest', message: body }
	const url = letter.message?.entry?.url
	console.warn(
		JSON.stringify({
			event: 'media.dead-letter',
			url_sha256: typeof url === 'string' ? await sha256Hex(url) : null,
			source: letter.message?.source ?? null,
			reason: letter.reason,
			attempts: letter.message?.deferrals ?? 0,
		}),
	)
}

export type QueueBody = CrawlMessage | MediaMessage | MediaDeadLetter | CrawlDeadLetter | NotifyMessage

export interface Delivery {
	body: QueueBody
	ack(): void
	retry(): void
}

/** Each message is acknowledged or retried on its own; a dead letter batch then tells the owner. */
export async function consumeBatch(services: Services, queue: string, messages: readonly Delivery[]): Promise<void> {
	for (const message of messages) {
		try {
			await dispatch(services, queue, message.body)
			message.ack()
		} catch (error) {
			console.error('queue message failed', queue, error)
			message.retry()
		}
	}
	if (DEAD_LETTER_QUEUES.includes(queue)) {
		await reportDeadLetters(
			services,
			queue,
			messages.map((message) => message.body),
		)
	}
}

function dispatch(services: Services, queue: string, body: QueueBody): Promise<void> {
	if (queue === 'prodid-media-ingest') return consumeMedia(services, body as MediaMessage)
	if (queue === 'prodid-media-dlq') return consumeMediaDeadLetter(body as MediaDeadLetter | MediaMessage)
	if (queue === 'prodid-notify') return consumeNotify(services, body as NotifyMessage).then(() => undefined)
	if (queue === 'prodid-notify-dlq') {
		consumeNotifyDeadLetter(body as NotifyMessage)
		return Promise.resolve()
	}
	if (queue === 'prodid-crawl-dlq') {
		consumeDeadLetter(body as CrawlDeadLetter | CrawlMessage)
		return Promise.resolve()
	}
	return consumeCrawl(services, body as CrawlMessage).then(() => undefined)
}

export async function runScheduled(services: Services): Promise<void> {
	await claimDueSources(services)
	const stale = await finalizeStaleCrawls(services.sql, { now: services.now(), olderThanMs: QUEUE_LEASE_MS })
	await enqueueNotices(services, stale.notices)
	const swept = await lapseSweep(services.sql, { now: services.now() })
	await enqueueNotices(services, swept.notices)
	try {
		await recoverStatus(services)
	} catch (error) {
		console.error('status recovery failed', error)
	}
}

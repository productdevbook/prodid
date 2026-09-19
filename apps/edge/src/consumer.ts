import { lapseSweep } from '@prodid/store'

import { enqueueDueSources, runCrawl } from './crawl/run'
import { POLICY } from './limits/policy'
import type { CrawlMessage, Services } from './services'

/**
 * A crawl held back by the crawler's own limits is not retried as a failure: it is acknowledged and
 * sent again with the delay the limit asked for, so it never counts against the queue's retries and
 * never reaches a dead letter queue for being early.
 */
export async function consumeCrawl(services: Services, message: CrawlMessage): Promise<void> {
	const result = await runCrawl(services, message.domain)
	if (result.kind !== 'deferred') return
	const deferrals = (message.deferrals ?? 0) + 1
	if (deferrals > POLICY.maxDeferrals) return
	const delaySeconds = Math.min(POLICY.maxDeferralSeconds, Math.max(1, Math.ceil(result.retryAfterMs / 1000)))
	await services.queue.send({ domain: message.domain, deferrals }, { delaySeconds })
}

export async function runScheduled(services: Services): Promise<void> {
	await enqueueDueSources(services)
	await lapseSweep(services.sql, { now: services.now() })
}

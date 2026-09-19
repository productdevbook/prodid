import { claimDueSources as claimRows } from '@prodid/store'

import type { Services } from './services'

/**
 * Hands the sources that are due to the queue. The claim marks them in the same statement it selects
 * them, so two cron runs that overlap take different pages instead of enqueueing everything twice
 * and burning a deferral each.
 */
export async function claimDueSources(services: Services, limit = 500): Promise<number> {
	const due = await claimRows(services.sql, { now: services.now(), intervalMs: services.crawlIntervalMs, limit })
	if (due.length === 0) return 0
	await services.queue.sendBatch(due.map((source) => ({ kind: 'discover' as const, domain: source.name })))
	return due.length
}

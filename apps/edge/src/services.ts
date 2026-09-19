import { createClient, type Sql } from '@prodid/store'

import { DurableLimiter, type Limiter } from './limits/client'
import { type Caps, DEFAULT_CAPS } from './net/guard'
import { LiveNetwork } from './net/live'
import type { Network } from './net/types'

export interface CrawlMessage {
	domain: string
	/** How many times this crawl has already been held back by the crawler's own limits. */
	deferrals?: number
}

export interface CrawlProducer {
	send(message: CrawlMessage, options?: { delaySeconds?: number }): Promise<void>
	sendBatch(messages: readonly CrawlMessage[]): Promise<void>
}

/** Everything with a side effect, in one bag, so a test can replace all of it and nothing else. */
export interface Services {
	sql: Sql
	net: Network
	limits: Limiter
	queue: CrawlProducer
	caps: Caps
	/** The only clock. Nothing below this reads the wall clock. */
	now: () => Date
	crawlIntervalMs: number
	/** Released when the invocation that built these services is over. */
	close?: () => Promise<void>
}

export interface Lifetime {
	waitUntil(promise: Promise<unknown>): void
}

/**
 * A fresh pool per invocation. A Worker cannot carry a socket from one request into the next — the
 * runtime refuses the I/O — and Hyperdrive is the pool that makes opening one cheap. It is closed
 * once the invocation is over, never before: `end()` starts closing the moment it is called.
 */
export function productionServices(env: Env): Services {
	const sql = createClient(env.HYPERDRIVE.connectionString)
	return {
		sql,
		close: () => sql.end({ timeout: 5 }),
		net: new LiveNetwork(env.DOH_ENDPOINT),
		limits: new DurableLimiter(env.LIMITS),
		queue: queueProducer(env.CRAWL),
		caps: DEFAULT_CAPS,
		now: () => new Date(),
		crawlIntervalMs: Number(env.CRAWL_INTERVAL_MINUTES) * 60_000,
	}
}

/** Queues take at most 100 messages per batch, and a 1000-domain ping is ten of them. */
export const QUEUE_BATCH = 100

function queueProducer(queue: Queue<CrawlMessage>): CrawlProducer {
	return {
		async send(message, options) {
			await queue.send(message, options?.delaySeconds === undefined ? undefined : { delaySeconds: options.delaySeconds })
		},
		async sendBatch(messages) {
			for (let at = 0; at < messages.length; at += QUEUE_BATCH) {
				await queue.sendBatch(messages.slice(at, at + QUEUE_BATCH).map((body) => ({ body })))
			}
		},
	}
}

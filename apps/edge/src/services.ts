import type { SourceKind, VerifiedBy } from '@prodid/core'
import { createClient, type Sql } from '@prodid/store'

import { DurableLimiter, type Limiter } from './limits/client'
import { type Caps, DEFAULT_CAPS } from './net/guard'
import { LiveNetwork } from './net/live'
import type { Network } from './net/types'

/**
 * What one crawl carries between its messages. A crawl is one `crawl` row from discovery to
 * finalize, and a message that is deferred and comes back resumes that same row rather than opening
 * another.
 */
export interface CrawlPlan {
	domain: string
	source: string
	crawl: string
	host: string
	via: VerifiedBy
	documentUrl: string
	status: number
	feeds: string[]
	zone: string
	/** Whether this source is already verified at `host`; one definition, used for the lane and for the benefit of the doubt. */
	verified: boolean
	/** The hosted source this crawl moves to the domain once it succeeds. */
	upgrade: string | null
	/** The source was lapsed when this crawl started: it reads everything and writes nothing until it has succeeded. */
	probe: boolean
	startedAt: string
}

export type CrawlMessage =
	| { kind: 'discover'; domain: string; deferrals?: number }
	/** `touched` carries forward whether anything this crawl did changed the index. */
	| { kind: 'feed'; plan: CrawlPlan; at: number; touched?: boolean; deferrals?: number }
	| { kind: 'finalize'; plan: CrawlPlan; touched?: boolean; deferrals?: number }

export interface CrawlProducer {
	send(message: CrawlMessage, options?: { delaySeconds?: number }): Promise<void>
	sendBatch(messages: readonly CrawlMessage[]): Promise<void>
}

/** Where a crawl goes when it has been held back so long that an operator should see it. */
export interface DeadLetters {
	send(message: CrawlMessage, reason: string): Promise<void>
}

/** Everything with a side effect, in one bag, so a test can replace all of it and nothing else. */
export interface Services {
	sql: Sql
	net: Network
	limits: Limiter
	queue: CrawlProducer
	dead: DeadLetters
	caps: Caps
	/** The only clock. Nothing below this reads the wall clock. */
	now: () => Date
	crawlIntervalMs: number
	/** Names under this zone are hosted slugs, whatever they serve. */
	hostingZone: string
	/** Released when the invocation that built these services is over. */
	close?: () => Promise<void>
}

export interface Lifetime {
	waitUntil(promise: Promise<unknown>): void
}

/** A name the index hosts on a publisher's behalf. Serving a document there proves control of a slug, not of a domain. */
export function isHostedName(name: string, hostingZone: string): boolean {
	return name === hostingZone || name.endsWith(`.${hostingZone}`)
}

export function sourceKindFor(name: string, hostingZone: string): SourceKind {
	return isHostedName(name, hostingZone) ? 'hosted' : 'domain'
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
		dead: deadLetters(env.CRAWL_DLQ),
		caps: DEFAULT_CAPS,
		now: () => new Date(),
		crawlIntervalMs: Number(env.CRAWL_INTERVAL_MINUTES) * 60_000,
		hostingZone: env.HOSTING_ZONE,
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

function deadLetters(queue: Queue<{ reason: string; message: CrawlMessage }>): DeadLetters {
	return {
		async send(message, reason) {
			await queue.send({ reason, message })
		},
	}
}

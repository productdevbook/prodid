import type { MediaEntry, SourceKind, VerifiedBy } from '@prodid/core'
import { createClient, type Sql } from '@prodid/store'

import { DurableLimiter, type Limiter } from './limits/client'
import { type ObjectStore, r2Store } from './media/store'
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
	/** The hosted source this crawl moves to the domain once it succeeds. */
	upgrade: string | null
	startedAt: string
}

export type CrawlMessage =
	| { kind: 'discover'; domain: string; deferrals?: number }
	/** `touched` carries forward whether anything this crawl did changed the index. */
	| { kind: 'feed'; plan: CrawlPlan; at: number; touched?: boolean; deferrals?: number }
	| { kind: 'finalize'; plan: CrawlPlan; touched?: boolean; deferrals?: number }

/**
 * One file, and every record of this source that named it. Several records of one feed naming one
 * photograph is the normal case — every size of a jacket carries the same picture — so the file is
 * read once and claimed for each of them.
 */
export interface MediaMessage {
	source: string
	/** The crawl that found this entry; a file that produces no claim is counted on it. */
	crawl: string
	/** The records that named this file, each getting its own claim. */
	targets: { recordKey: string; opid: string }[]
	entry: MediaEntry
	/** The registrable domain of the source, which bounds its share of any one media host. */
	zone: string
	/** The file is already stored and claimed; this is the periodic re-read of it. */
	recheck?: boolean
	deferrals?: number
}

export interface CrawlProducer {
	send(message: CrawlMessage, options?: { delaySeconds?: number }): Promise<void>
	sendBatch(messages: readonly CrawlMessage[]): Promise<void>
}

export interface MediaProducer {
	sendBatch(messages: readonly MediaMessage[]): Promise<void>
	send(message: MediaMessage, options?: { delaySeconds?: number }): Promise<void>
}

/** Where a crawl goes when it has been held back so long that an operator should see it. */
export interface DeadLetters {
	send(message: CrawlMessage, reason: string): Promise<void>
}

export interface MediaDeadLetter {
	reason: string
	message: MediaMessage
}

/** Where a file goes when it has been held back so long that an operator should see it. */
export interface MediaDeadLetters {
	send(message: MediaMessage, reason: string): Promise<void>
}

/** Everything with a side effect, in one bag, so a test can replace all of it and nothing else. */
export interface Services {
	sql: Sql
	net: Network
	limits: Limiter
	queue: CrawlProducer
	mediaQueue: MediaProducer
	/** Where stored files live. `media.prodid.org` serves this bucket. */
	media: ObjectStore
	dead: DeadLetters
	mediaDead: MediaDeadLetters
	caps: Caps
	/** The only clock. Nothing below this reads the wall clock. */
	now: () => Date
	crawlIntervalMs: number
	/** Names under this zone are hosted slugs, whatever they serve. */
	hostingZone: string
	/** The host `/sha256/*` answers on; nothing else answers there. */
	mediaHost: string
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
		mediaQueue: mediaProducer(env.MEDIA_INGEST),
		media: r2Store(env.MEDIA),
		dead: deadLetters(env.CRAWL_DLQ),
		mediaDead: mediaDeadLetters(env.MEDIA_DLQ),
		caps: DEFAULT_CAPS,
		now: () => new Date(),
		crawlIntervalMs: Number(env.CRAWL_INTERVAL_MINUTES) * 60_000,
		hostingZone: env.HOSTING_ZONE,
		mediaHost: env.MEDIA_HOST,
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

function mediaProducer(queue: Queue<MediaMessage>): MediaProducer {
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

function mediaDeadLetters(queue: Queue<MediaDeadLetter>): MediaDeadLetters {
	return {
		async send(message, reason) {
			await queue.send({ reason, message })
		},
	}
}

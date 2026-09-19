import { createDatabase, type Sql, type Throwaway } from '@prodid/store/testing'

import { createApp } from '../../src/app'
import { consumeCrawl } from '../../src/consumer'
import { type CrawlRun, runCrawl } from '../../src/crawl/run'
import { DEFAULT_CAPS } from '../../src/net/guard'
import type { CrawlMessage, Services } from '../../src/services'
import { FakeNetwork, LocalLimiter, MemoryQueue, TestClock } from './fakes'

export interface Edge {
	sql: Sql
	net: FakeNetwork
	clock: TestClock
	queue: MemoryQueue
	limits: LocalLimiter
	services: Services
	fetch(path: string, init?: RequestInit): Promise<Response>
	crawl(domain: string): Promise<CrawlRun>
	/** Runs every queued crawl whose delay has elapsed, the way the queue consumer would. */
	drain(rounds?: number): Promise<void>
	reset(): Promise<void>
}

export async function startEdge(options: { at?: Date } = {}): Promise<Edge & { stop(): Promise<void> }> {
	const database: Throwaway = await createDatabase()
	const clock = new TestClock(options.at ?? new Date('2026-09-19T08:00:00.000Z'))
	// Not a spread: `net` and `limits` are accessors that `reset()` swaps, and spreading would
	// freeze the first pair into the returned object while the services kept the new ones.
	return Object.assign(build(database.sql, clock), { stop: () => database.drop() })
}

function build(sql: Sql, clock: TestClock): Edge {
	let net = new FakeNetwork()
	let limits = new LocalLimiter()
	const queue = new MemoryQueue(clock)

	const services: Services = {
		sql,
		get net() {
			return net
		},
		get limits() {
			return limits
		},
		queue,
		caps: { ...DEFAULT_CAPS },
		now: clock.now,
		crawlIntervalMs: 6 * 3_600_000,
	}

	const app = createApp(() => services)

	const edge: Edge = {
		sql,
		get net() {
			return net
		},
		clock,
		queue,
		get limits() {
			return limits
		},
		services,
		async fetch(path, init) {
			return await app.fetch(new Request(`https://prodid.org${path}`, init), {} as Env)
		},
		crawl(domain) {
			return runCrawl(services, domain)
		},
		async drain(rounds = 4) {
			for (let round = 0; round < rounds; round += 1) {
				const due = queue.ready()
				if (due.length === 0) return
				for (const message of due) await consumeCrawl(services, message as CrawlMessage)
			}
		},
		async reset() {
			net = new FakeNetwork()
			limits = new LocalLimiter()
			queue.pending.length = 0
			queue.sent.length = 0
			await sql`truncate claim, record, grouping, identifier, merge, entity, crawl, feed, source restart identity cascade`
		},
	}
	return edge
}

export async function json<T>(response: Response): Promise<T> {
	return (await response.json()) as T
}

import { createDatabase, type Sql, type Throwaway } from '@prodid/store/testing'

import { createApp } from '../../src/app'
import { consumeCrawl, consumeMedia } from '../../src/consumer'
import type { CrawlStep } from '../../src/crawl/run'
import { DEFAULT_CAPS } from '../../src/net/guard'
import type { Services } from '../../src/services'
import { FakeNetwork, LocalLimiter, MemoryBucket, MemoryDeadLetters, MemoryMediaQueue, MemoryQueue, TestClock } from './fakes'

export interface Edge {
	sql: Sql
	net: FakeNetwork
	clock: TestClock
	queue: MemoryQueue
	mediaQueue: MemoryMediaQueue
	media: MemoryBucket
	dead: MemoryDeadLetters
	limits: LocalLimiter
	services: Services
	fetch(path: string, init?: RequestInit): Promise<Response>
	/** Discovery and every message it leads to, the way the consumer would run them. */
	crawl(domain: string): Promise<CrawlStep>
	/** Runs every queued message whose delay has elapsed. */
	drain(rounds?: number): Promise<CrawlStep | null>
	/** Runs every media message whose delay has elapsed, the way its consumer would. */
	drainMedia(rounds?: number): Promise<void>
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
	const mediaQueue = new MemoryMediaQueue(clock)
	const media = new MemoryBucket()
	const dead = new MemoryDeadLetters()

	const services: Services = {
		sql,
		get net() {
			return net
		},
		get limits() {
			return limits
		},
		queue,
		mediaQueue,
		media,
		dead,
		caps: { ...DEFAULT_CAPS },
		now: clock.now,
		crawlIntervalMs: 6 * 3_600_000,
		hostingZone: 'prodid.org',
	}

	const app = createApp(() => services)

	async function drain(rounds = 250): Promise<CrawlStep | null> {
		let last: CrawlStep | null = null
		for (let round = 0; round < rounds; round += 1) {
			const due = queue.ready()
			if (due.length === 0) return last
			for (const message of due) {
				const step = await consumeCrawl(services, message)
				if (step.kind === 'done' || step.kind === 'deferred' || step.kind === 'ignored') last = step
			}
		}
		return last
	}

	async function drainMedia(rounds = 50): Promise<void> {
		for (let round = 0; round < rounds; round += 1) {
			const due = mediaQueue.ready()
			if (due.length === 0) return
			for (const message of due) await consumeMedia(services, message)
		}
	}

	const edge: Edge = {
		sql,
		get net() {
			return net
		},
		clock,
		queue,
		mediaQueue,
		media,
		dead,
		get limits() {
			return limits
		},
		services,
		async fetch(path, init) {
			return await app.fetch(new Request(`https://prodid.org${path}`, init), {} as Env)
		},
		async crawl(domain) {
			const started = await consumeCrawl(services, { kind: 'discover', domain })
			if (started.kind !== 'continued') return started
			return (await drain()) ?? started
		},
		drain,
		drainMedia,
		async reset() {
			net = new FakeNetwork()
			limits = new LocalLimiter()
			queue.pending.length = 0
			queue.sent.length = 0
			mediaQueue.pending.length = 0
			mediaQueue.sent.length = 0
			media.objects.clear()
			dead.letters.length = 0
			// `media` belongs here too: it is keyed by digest and shared by every source, so a row
			// left behind — a blocked hash above all — decides the next test's answer.
			await sql`truncate claim, record, grouping, identifier, merge, entity, crawl, feed, source, media restart identity cascade`
		},
	}
	return edge
}

export async function json<T>(response: Response): Promise<T> {
	return (await response.json()) as T
}

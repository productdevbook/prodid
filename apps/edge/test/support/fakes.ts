import { Database } from 'bun:sqlite'

import type { TxtRecord } from '@prodid/core'

import type { Limiter } from '../../src/limits/client'
import { POLICY } from '../../src/limits/policy'
import {
	type Decision,
	gateOnce,
	type HostDecision,
	initLimitSchema,
	setVerifiedSources,
	type SqlLike,
	takeHost,
	takeWindow,
} from '../../src/limits/window'
import type { AddressLookup, LookupFailure, Network, NetworkRequest, NetworkResponse, TxtLookup } from '../../src/net/types'
import type { CrawlMessage, CrawlProducer, DeadLetters } from '../../src/services'

export class TestClock {
	constructor(private at: Date) {}

	now = (): Date => new Date(this.at)

	advance(ms: number): this {
		this.at = new Date(this.at.getTime() + ms)
		return this
	}

	advanceDays(days: number): this {
		return this.advance(days * 86_400_000)
	}
}

export interface FakeReply {
	status: number
	headers?: Record<string, string>
	body?: string | Uint8Array | ReadableStream<Uint8Array>
}

export type FakeHandler = (request: { url: string; headers: Record<string, string> }) => FakeReply | Promise<FakeReply>

const PUBLIC_ADDRESS = '93.184.216.34'

/**
 * The whole outside world, scripted. Nothing in the crawler can reach anything this object does not
 * hand it, which is what lets the attacks be replayed with no network at all.
 */
export class FakeNetwork implements Network {
	readonly fetched: string[] = []
	readonly resolvedNames: string[] = []
	readonly resolvedAddresses: string[] = []
	private readonly txt = new Map<string, TxtRecord[] | { fail: LookupFailure }>()
	private readonly addresses = new Map<string, string[] | { fail: LookupFailure }>()
	private readonly routes = new Map<string, FakeHandler>()

	setTxt(name: string, records: TxtRecord[] | { fail: LookupFailure }): this {
		this.txt.set(name, records)
		return this
	}

	setAddresses(host: string, addresses: string[] | { fail: LookupFailure }): this {
		this.addresses.set(host, addresses)
		return this
	}

	serve(url: string, reply: FakeReply | FakeHandler): this {
		this.routes.set(url, typeof reply === 'function' ? reply : () => reply)
		return this
	}

	document(host: string, body: unknown, options: { etag?: string; contentType?: string } = {}): this {
		return this.serve(`https://${host}/.well-known/prodid.json`, jsonFile(body, options))
	}

	feed(url: string, lines: readonly unknown[], options: { etag?: string } = {}): this {
		return this.serve(url, ndjsonFile(lines, options))
	}

	async resolveTxt(name: string, _timeoutMs: number): Promise<TxtLookup> {
		this.resolvedNames.push(name)
		const entry = this.txt.get(name)
		if (entry === undefined) return { ok: true, records: [] }
		if (!Array.isArray(entry)) return { ok: false, reason: entry.fail }
		return { ok: true, records: entry }
	}

	async resolveAddresses(host: string, _timeoutMs: number): Promise<AddressLookup> {
		this.resolvedAddresses.push(host)
		const entry = this.addresses.get(host)
		if (entry === undefined) return { ok: true, addresses: [PUBLIC_ADDRESS] }
		if (!Array.isArray(entry)) return { ok: false, reason: entry.fail }
		return { ok: true, addresses: entry }
	}

	async fetch(request: NetworkRequest): Promise<NetworkResponse> {
		this.fetched.push(request.url)
		const handler = this.routes.get(request.url)
		if (handler === undefined) return { status: 404, headers: new Headers({ 'content-type': 'text/html' }), body: null }
		const reply = await handler({ url: request.url, headers: request.headers })
		return {
			status: reply.status,
			headers: new Headers(reply.headers ?? {}),
			body: reply.body === undefined ? null : toStream(reply.body),
		}
	}
}

export function jsonFile(body: unknown, options: { etag?: string; contentType?: string } = {}): FakeHandler {
	const text = typeof body === 'string' ? body : JSON.stringify(body)
	return ({ headers }) => {
		if (options.etag !== undefined && headers['if-none-match'] === options.etag) {
			return { status: 304, headers: { etag: options.etag } }
		}
		return {
			status: 200,
			headers: {
				'content-type': options.contentType ?? 'application/json',
				...(options.etag === undefined ? {} : { etag: options.etag }),
			},
			body: text,
		}
	}
}

export function ndjsonFile(lines: readonly unknown[], options: { etag?: string } = {}): FakeHandler {
	const text = lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')
	return ({ headers }) => {
		if (options.etag !== undefined && headers['if-none-match'] === options.etag) {
			return { status: 304, headers: { etag: options.etag } }
		}
		return {
			status: 200,
			headers: { 'content-type': 'application/x-ndjson', ...(options.etag === undefined ? {} : { etag: options.etag }) },
			body: text,
		}
	}
}

/** A body that arrives slowly and never ends: the deadline has to be what stops it. */
export function dripBody(chunkMs = 50): ReadableStream<Uint8Array> {
	const chunk = new TextEncoder().encode('{"$type":"org.prodid.feed"')
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			await new Promise((resolve) => setTimeout(resolve, chunkMs))
			controller.enqueue(chunk)
		},
	})
}

function toStream(body: string | Uint8Array | ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	if (body instanceof ReadableStream) return body
	const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes)
			controller.close()
		},
	})
}

export class MemorySql implements SqlLike {
	private readonly db = new Database(':memory:')

	exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): { toArray(): T[] } {
		const rows = this.db.prepare(query).all(...(bindings as never[])) as T[]
		return { toArray: () => rows }
	}
}

/**
 * The same window code the Durable Object runs, over one SQLite database per bucket. Every call is
 * synchronous, so a bucket is serialized exactly as the runtime's input gate serializes the object.
 */
export class LocalLimiter implements Limiter {
	private readonly buckets = new Map<string, MemorySql>()

	async domainGate(domain: string, now: Date): Promise<Decision> {
		return gateOnce(this.bucket(`domain:${domain}`), now.getTime(), POLICY.domainWindowMs)
	}

	async caller(key: string, now: Date): Promise<Decision> {
		return takeWindow(this.bucket(`caller:${key}`), 'caller', now.getTime(), POLICY.caller.windowMs, POLICY.caller.limit)
	}

	async firstContact(registrable: string, now: Date): Promise<Decision> {
		return takeWindow(
			this.bucket(`registrable:${registrable}`),
			'first-contact',
			now.getTime(),
			POLICY.registrable.windowMs,
			POLICY.registrable.limit,
		)
	}

	async hostFetch(host: string, verified: boolean, now: Date, zone?: string): Promise<HostDecision> {
		return takeHost(this.bucket(`host:${host}`), now.getTime(), POLICY.host.windowMs, verified, {
			staleAfterMs: POLICY.host.staleAfterMs,
			zone: zone ?? '',
		})
	}

	async reportVerifiedSources(host: string, count: number, now: Date): Promise<void> {
		setVerifiedSources(this.bucket(`host:${host}`), count, now.getTime())
	}

	/** The same storage the Durable Object would hold, for a test that needs to look inside one. */
	bucketFor(name: string): MemorySql {
		return this.bucket(name)
	}

	private bucket(name: string): MemorySql {
		let bucket = this.buckets.get(name)
		if (bucket === undefined) {
			bucket = new MemorySql()
			initLimitSchema(bucket)
			this.buckets.set(name, bucket)
		}
		return bucket
	}
}

export class MemoryDeadLetters implements DeadLetters {
	readonly letters: { reason: string; message: CrawlMessage }[] = []

	async send(message: CrawlMessage, reason: string): Promise<void> {
		this.letters.push({ reason, message })
	}
}

export class MemoryQueue implements CrawlProducer {
	readonly pending: { body: CrawlMessage; readyAt: number }[] = []
	readonly sent: CrawlMessage[] = []

	constructor(private readonly clock: TestClock) {}

	async send(message: CrawlMessage, options?: { delaySeconds?: number }): Promise<void> {
		this.sent.push(message)
		this.pending.push({ body: message, readyAt: this.clock.now().getTime() + (options?.delaySeconds ?? 0) * 1000 })
	}

	async sendBatch(messages: readonly CrawlMessage[]): Promise<void> {
		for (const message of messages) await this.send(message)
	}

	/** The messages whose delay has elapsed, removed from the queue. */
	ready(): CrawlMessage[] {
		const at = this.clock.now().getTime()
		const due = this.pending.filter((entry) => entry.readyAt <= at)
		for (const entry of due) this.pending.splice(this.pending.indexOf(entry), 1)
		return due.map((entry) => entry.body)
	}
}

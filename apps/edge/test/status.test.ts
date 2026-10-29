import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { recordDeadLetter } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { consumeBatch, type Delivery, type QueueBody, runScheduled } from '../src/consumer'
import type { CrawlPlan } from '../src/services'
import { QUIET_MESSAGE, yuvaStatus } from '../src/status'
import { startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const STATUS_URL = 'https://status.example/api/push/secret-token'
const HOUR = 3_600_000

interface Pushed {
	url: string
	method: string | undefined
	contentType: string | null
	body: { state: string; message: string }
}

class FakeFetch {
	readonly calls: Pushed[] = []
	fail: 'throw' | 503 | null = null
	during: ((pushed: Pushed) => Promise<void>) | null = null

	fetch = async (url: string, init: RequestInit): Promise<Response> => {
		const pushed: Pushed = {
			url,
			method: init.method,
			contentType: new Headers(init.headers).get('content-type'),
			body: JSON.parse(String(init.body)) as Pushed['body'],
		}
		this.calls.push(pushed)
		await this.during?.(pushed)
		if (this.fail === 'throw') throw new Error(`connect failed: ${url}`)
		if (this.fail === 503) return new Response('unavailable', { status: 503 })
		return new Response('{"ok":true}', { status: 202 })
	}
}

const plan: CrawlPlan = {
	domain: 'acme.example',
	source: '1',
	crawl: '7',
	host: 'acme.example',
	via: 'well-known',
	documentUrl: 'https://acme.example/.well-known/prodid.json',
	status: 200,
	feeds: ['https://acme.example/items.ndjson'],
	zone: 'acme.example',
	upgrade: null,
	startedAt: '2026-09-19T08:00:00.000Z',
	contact: 'data@acme.example',
}

interface Batch {
	messages: Delivery[]
	acked: number
	retried: number
}

function batch(bodies: readonly QueueBody[]): Batch {
	const result: Batch = { messages: [], acked: 0, retried: 0 }
	for (const body of bodies) {
		result.messages.push({
			body,
			ack: () => {
				result.acked += 1
			},
			retry: () => {
				result.retried += 1
			},
		})
	}
	return result
}

describe.skipIf(!reachable)('the dead letters status component', () => {
	let fake: FakeFetch
	let errors: unknown[][]
	let restore: () => void

	beforeEach(async () => {
		await edge!.reset()
		fake = new FakeFetch()
		edge!.services.status = yuvaStatus(STATUS_URL, fake.fetch)
		errors = []
		const warn = spyOn(console, 'warn').mockImplementation(() => {})
		const error = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			errors.push(args)
		})
		restore = () => {
			warn.mockRestore()
			error.mockRestore()
		}
	})

	afterEach(() => restore())

	test('a crawl dead letter batch pushes degraded once, after its letters are acknowledged', async () => {
		const letters = batch([
			{ reason: "held back by the crawler's own limits 13 times", message: { kind: 'feed', plan, at: 0, deferrals: 13 } },
			{ kind: 'discover', domain: 'other.example' },
		])
		fake.during = async () => {
			expect(letters.acked).toBe(2)
		}
		await consumeBatch(edge!.services, 'prodid-crawl-dlq', letters.messages)

		expect(fake.calls).toEqual([
			{
				url: STATUS_URL,
				method: 'POST',
				contentType: 'application/json',
				body: {
					state: 'degraded',
					message: "2 dead letters on prodid-crawl-dlq. First: acme.example (feed), held back by the crawler's own limits 13 times.",
				},
			},
		])
		expect(fake.calls[0]!.body.message).not.toContain('data@acme.example')
		expect(letters).toMatchObject({ acked: 2, retried: 0 })
		const rows = await edge!.sql<{ queue: string; last_at: Date }[]>`select queue, last_at from dead_letter`
		expect([...rows]).toEqual([{ queue: 'prodid-crawl-dlq', last_at: edge!.clock.now() }])
	})

	test('a media dead letter names the source zone, not the publisher URL', async () => {
		await consumeBatch(
			edge!.services,
			'prodid-media-dlq',
			batch([
				{
					source: '1',
					crawl: '7',
					targets: [{ recordKey: 'navy-m', opid: 'op_1' }],
					entry: { url: 'https://cdn.acme.example/private/jacket.jpg', license: 'CC0-1.0' },
					zone: 'acme.example',
				},
			]).messages,
		)
		expect(fake.calls.map((call) => call.body)).toEqual([
			{
				state: 'degraded',
				message: '1 dead letter on prodid-media-dlq. First: media of acme.example, failed on every retry of prodid-media-ingest.',
			},
		])
	})

	test('a notice dead letter names the source id and no contact', async () => {
		await consumeBatch(
			edge!.services,
			'prodid-notify-dlq',
			batch([{ source: '00000000-0000-0000-0000-000000000000', lapsed_at: '2026-09-19T08:00:00.000Z' }]).messages,
		)
		expect(fake.calls.map((call) => call.body)).toEqual([
			{
				state: 'degraded',
				message:
					'1 dead letter on prodid-notify-dlq. First: lapse notice of source 00000000-0000-0000-0000-000000000000, failed on every retry of prodid-notify.',
			},
		])
	})

	test('a long domain is cut to the 1000 characters the status page takes', async () => {
		const domain = `${'a'.repeat(1200)}.example`
		await consumeBatch(edge!.services, 'prodid-crawl-dlq', batch([{ kind: 'discover', domain }]).messages)
		expect(Array.from(fake.calls[0]!.body.message)).toHaveLength(1000)
	})

	for (const failure of ['throw', 503] as const) {
		test(`a push that fails (${failure}) is logged and leaves the batch acknowledged`, async () => {
			fake.fail = failure
			const letters = batch([{ kind: 'discover', domain: 'acme.example' }])
			await consumeBatch(edge!.services, 'prodid-crawl-dlq', letters.messages)
			expect(fake.calls).toHaveLength(1)
			expect(letters).toMatchObject({ acked: 1, retried: 0 })
			expect(errors).toHaveLength(1)
			expect(String(errors[0]![0])).toBe('status push failed')
			expect(JSON.stringify(errors)).not.toContain('secret-token')
		})
	}

	test('a batch of any other queue pushes nothing', async () => {
		await consumeBatch(edge!.services, 'prodid-notify', batch([{ source: '1', lapsed_at: 'not a date' }]).messages)
		expect(fake.calls).toEqual([])
	})

	test('the cron pushes operational only once a day has passed without a dead letter', async () => {
		await consumeBatch(edge!.services, 'prodid-crawl-dlq', batch([{ kind: 'discover', domain: 'acme.example' }]).messages)
		fake.calls.length = 0

		edge!.clock.advance(23 * HOUR)
		await runScheduled(edge!.services)
		expect(fake.calls).toEqual([])

		edge!.clock.advance(HOUR)
		await runScheduled(edge!.services)
		expect(fake.calls.map((call) => call.body)).toEqual([{ state: 'operational', message: QUIET_MESSAGE }])

		edge!.clock.advance(10 * 60_000)
		await runScheduled(edge!.services)
		expect(fake.calls).toHaveLength(2)
	})

	test('with no dead letter ever, each cron run pushes operational once', async () => {
		await runScheduled(edge!.services)
		expect(fake.calls.map((call) => call.body.state)).toEqual(['operational'])
	})

	test('a dead letter recorded while the recovery is in flight is pushed again after it', async () => {
		fake.during = async (pushed) => {
			if (pushed.body.state !== 'operational') return
			await recordDeadLetter(edge!.sql, { queue: 'prodid-media-dlq', at: edge!.clock.now(), message: 'late letter' })
		}
		await runScheduled(edge!.services)
		expect(fake.calls.map((call) => call.body)).toEqual([
			{ state: 'operational', message: QUIET_MESSAGE },
			{ state: 'degraded', message: 'late letter' },
		])
	})

	test('nothing is sent when the address is not set', async () => {
		expect(yuvaStatus(undefined, fake.fetch)).toBeNull()
		expect(yuvaStatus('', fake.fetch)).toBeNull()
		edge!.services.status = yuvaStatus(undefined, fake.fetch)

		const letters = batch([{ kind: 'discover', domain: 'acme.example' }])
		await consumeBatch(edge!.services, 'prodid-crawl-dlq', letters.messages)
		edge!.clock.advance(25 * HOUR)
		await runScheduled(edge!.services)

		expect(fake.calls).toEqual([])
		expect(letters).toMatchObject({ acked: 1, retried: 0 })
	})
})

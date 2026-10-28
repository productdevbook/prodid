import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { databaseReachable } from '@prodid/store/testing'

import { runScheduled } from '../src/consumer'
import { consumeNotify, consumeNotifyDeadLetter } from '../src/notify'
import { document, JACKET } from './support/fixtures'
import { startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const DAY = 86_400_000
const TEN_MINUTES = 600_001
const FEED = 'https://acme.example/items.ndjson'
const DOCUMENT = 'https://acme.example/.well-known/prodid.json'

function publish(contact: string | null = 'data@acme.example'): void {
	edge!.net.document(
		'acme.example',
		document({ feeds: [FEED], publisher: contact === null ? { name: 'Acme' } : { name: 'Acme', contact } }),
	)
	edge!.net.feed(FEED, [JACKET.navy])
}

async function crawlAgain(after = TEN_MINUTES): Promise<void> {
	edge!.clock.advance(after)
	await edge!.crawl('acme.example')
}

async function deliver(): Promise<void> {
	for (const message of edge!.notify.ready()) await consumeNotify(edge!.services, message)
}

async function lapsedAt(): Promise<string> {
	const rows = await edge!.sql<{ lapsed_at: Date | null; notified_lapse_at: Date | null }[]>`
		select lapsed_at, notified_lapse_at from source where name = 'acme.example'
	`
	const at = rows[0]?.lapsed_at
	if (at === null || at === undefined) throw new Error('acme.example is not lapsed')
	return at.toISOString()
}

async function notified(): Promise<string | null> {
	const rows = await edge!.sql<{ notified_lapse_at: Date | null }[]>`select notified_lapse_at from source where name = 'acme.example'`
	return rows[0]?.notified_lapse_at?.toISOString() ?? null
}

describe.skipIf(!reachable)('the lapse notice', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a definite negative sends one mail with the six parts in order, and records it', async () => {
		publish()
		await edge!.crawl('acme.example')
		expect(edge!.notify.sent).toHaveLength(0)

		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		const at = await lapsedAt()
		expect(edge!.notify.sent).toEqual([{ source: expect.any(String), lapsed_at: at }])

		await deliver()
		expect(edge!.mail.sent).toHaveLength(1)
		const mail = edge!.mail.sent[0]!
		expect(mail.to).toBe('data@acme.example')
		expect(mail.subject).toBe('prodid: acme.example stopped publishing')
		const withdrawal = new Date(new Date(at).getTime() + 30 * DAY).toISOString()
		const parts = [
			`acme.example has been lapsed since ${at}`,
			'definite-negative',
			`withdrawn on ${withdrawal}`,
			'https://prodid.org/source/acme.example',
			'POST https://prodid.org/ping',
			'publisher.contact of acme.example',
		]
		const positions = parts.map((part) => mail.text.indexOf(part))
		for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
		expect([...positions].sort((a, b) => a - b)).toEqual(positions)
		expect(await notified()).toBe(at)
	})

	test('seven days of transport failure send a transport-failure notice', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 503 })
		for (let day = 0; day <= 6; day += 1) await crawlAgain(DAY)
		expect(edge!.notify.sent).toHaveLength(0)

		await crawlAgain(DAY)
		expect(edge!.notify.sent).toHaveLength(1)
		await deliver()
		expect(edge!.mail.sent).toHaveLength(1)
		expect(edge!.mail.sent[0]!.text).toContain('ended in transport-failure')
	})

	test('the sweep’s seven-day lapse enqueues through the same path', async () => {
		publish()
		await edge!.crawl('acme.example')
		await edge!.sql`update source set failing_since = ${new Date(edge!.clock.now().getTime() - 8 * DAY)} where name = 'acme.example'`
		await runScheduled(edge!.services)
		expect(edge!.notify.sent).toEqual([{ source: expect.any(String), lapsed_at: await lapsedAt() }])
		await deliver()
		expect(edge!.mail.sent[0]!.text).toContain('ended in transport-failure')
	})

	test('a source whose document carried no contact is not notified', async () => {
		publish(null)
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		await lapsedAt()
		expect(edge!.notify.sent).toHaveLength(0)
		expect(edge!.mail.sent).toHaveLength(0)
	})

	test('a lapse that keeps failing, and a message delivered twice, send one mail', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		const message = edge!.notify.sent[0]!
		for (let crawl = 0; crawl < 3; crawl += 1) await crawlAgain()
		edge!.clock.advance(8 * DAY)
		await runScheduled(edge!.services)
		expect(edge!.notify.sent).toHaveLength(1)

		await deliver()
		expect(await consumeNotify(edge!.services, message)).toBe('skipped')
		expect(edge!.mail.sent).toHaveLength(1)
	})

	test('a lapse that is cleared and starts again is a new notice', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		const first = await lapsedAt()
		await deliver()

		publish()
		await crawlAgain()
		await crawlAgain()
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		const second = await lapsedAt()
		expect(second).not.toBe(first)
		await deliver()
		expect(edge!.mail.sent).toHaveLength(2)
		expect(await notified()).toBe(second)
	})

	test('a notice whose lapse was cleared before it was sent is dropped', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		publish()
		await crawlAgain()
		await deliver()
		expect(edge!.mail.sent).toHaveLength(0)
	})

	test('two deliveries of one message at the same time send one mail', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		const message = edge!.notify.sent[0]!
		const results = await Promise.all([consumeNotify(edge!.services, message), consumeNotify(edge!.services, message)])
		expect(results.sort()).toEqual(['sent', 'skipped'])
		expect(edge!.mail.sent).toHaveLength(1)
	})

	test('a send that fails gives the claim back, so the retry sends it once', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		const message = edge!.notify.sent[0]!

		edge!.mail.failures = 1
		await expect(consumeNotify(edge!.services, message)).rejects.toThrow('mail service unavailable')
		expect(await notified()).toBeNull()

		expect(await consumeNotify(edge!.services, message)).toBe('sent')
		expect(await consumeNotify(edge!.services, message)).toBe('skipped')
		expect(edge!.mail.sent).toHaveLength(1)
	})

	test('the mail says no more than the status: no HTTP status, no error text', async () => {
		publish()
		await edge!.crawl('acme.example')
		edge!.net.serve(DOCUMENT, { status: 503 })
		for (let day = 0; day <= 7; day += 1) await crawlAgain(DAY)
		await deliver()
		const errors = await edge!.sql<{ error: string | null }[]>`select error from crawl where error is not null`
		expect(errors.length).toBeGreaterThan(0)

		const { text, subject } = edge!.mail.sent[0]!
		for (const error of errors) expect(text).not.toContain(error.error!)
		expect(`${subject}\n${text}`).not.toMatch(/\b503\b/)
		expect(text).not.toContain('.well-known')
		expect(text).not.toContain('data@acme.example')
	})

	test('a dead letter is one structured line without the contact', () => {
		const lines: string[] = []
		const warn = console.warn
		console.warn = (line: string) => lines.push(line)
		try {
			consumeNotifyDeadLetter({ source: '00000000-0000-0000-0000-000000000000', lapsed_at: '2026-09-19T08:00:00.000Z' })
		} finally {
			console.warn = warn
		}
		expect(JSON.parse(lines[0]!)).toEqual({
			event: 'notify.dead-letter',
			reason: 'failed on every retry of prodid-notify',
			source: '00000000-0000-0000-0000-000000000000',
			lapsed_at: '2026-09-19T08:00:00.000Z',
		})
	})
})

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { databaseReachable } from '@prodid/store/testing'

import { document, JACKET } from './support/fixtures'
import { startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001
const FEED = 'https://acme.example/items.ndjson'
const DOCUMENT = 'https://acme.example/.well-known/prodid.json'

async function kept(): Promise<{ contact: string | null; notified_lapse_at: Date | null }> {
	const rows = await edge!.sql<{ contact: string | null; notified_lapse_at: Date | null }[]>`
		select contact, notified_lapse_at from source where name = 'acme.example'
	`
	const row = rows[0]
	if (row === undefined) throw new Error('acme.example has no source row')
	return row
}

async function crawlAgain(): Promise<void> {
	edge!.clock.advance(TEN_MINUTES)
	await edge!.crawl('acme.example')
}

describe.skipIf(!reachable)('the source contact', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
		edge!.net.feed(FEED, [JACKET.navy])
	})

	test('a successful crawl keeps the accepted document’s contact, and nothing has been notified', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'data@acme.example' } }))
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
		expect(await kept()).toEqual({ contact: 'data@acme.example', notified_lapse_at: null })

		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'catalog@acme.example' } }))
		await crawlAgain()
		expect((await kept()).contact).toBe('catalog@acme.example')
	})

	test('a document without a contact keeps none', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'data@acme.example' } }))
		await edge!.crawl('acme.example')
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme' } }))
		await crawlAgain()
		expect((await kept()).contact).toBeNull()
	})

	test('a crawl that does not succeed leaves the kept contact, even when its document named another', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'data@acme.example' } }))
		await edge!.crawl('acme.example')

		edge!.net.serve(DOCUMENT, { status: 503 })
		await crawlAgain()
		expect((await kept()).contact).toBe('data@acme.example')

		edge!.net.serve(DOCUMENT, { status: 404 })
		await crawlAgain()
		expect((await kept()).contact).toBe('data@acme.example')

		// The document is read and accepted, but its feed fails, so the crawl is not a success.
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'other@stranger.example' } }))
		edge!.net.serve(FEED, { status: 500 })
		await crawlAgain()
		expect((await kept()).contact).toBe('data@acme.example')
	})

	test('a document that answers 304 leaves the kept contact', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'data@acme.example' } }), {
			etag: 'd1',
		})
		edge!.net.feed(FEED, [JACKET.navy], { etag: 'f1' })
		await edge!.crawl('acme.example')
		await crawlAgain()
		expect(edge!.net.fetched.filter((url) => url === DOCUMENT)).toHaveLength(2)
		expect(await edge!.sql`select 1 from crawl where outcome = 'unchanged'`).toHaveLength(1)
		expect((await kept()).contact).toBe('data@acme.example')
	})

	test('/source/{name} never shows it, as JSON or as HTML', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED], publisher: { name: 'Acme', contact: 'data@acme.example' } }))
		await edge!.crawl('acme.example')
		expect((await kept()).contact).toBe('data@acme.example')

		const asJson = await edge!.fetch('/source/acme.example', { headers: { accept: 'application/json' } })
		expect(asJson.status).toBe(200)
		const body = await asJson.text()
		expect(body).not.toContain('data@acme.example')
		expect(body).not.toContain('contact')

		const asHtml = await edge!.fetch('/source/acme.example', { headers: { accept: 'text/html' } })
		expect(asHtml.headers.get('content-type')).toContain('text/html')
		const page = await asHtml.text()
		expect(page).not.toContain('data@acme.example')
		expect(page).not.toContain('contact')
	})
})

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { EntityRecord } from '@prodid/core'
import { mergeEntities } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { document, GTINS, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const JSON_ACCEPT = { accept: 'application/json' }
const HTML_ACCEPT = { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }
const UNKNOWN_OPID = '0000000000000000'

let navy = ''
let black = ''

function origin(response: Response): string | null {
	return response.headers.get('access-control-allow-origin')
}

async function revalidated(path: string, headers: Record<string, string>): Promise<Response> {
	const first = await edge!.fetch(path, { headers })
	const etag = first.headers.get('etag')
	expect(etag).not.toBeNull()
	return await edge!.fetch(path, { headers: { ...headers, 'if-none-match': etag! } })
}

describe.skipIf(!reachable)('resolver JSON is readable from any origin, HTML is not', () => {
	beforeAll(async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy, JACKET.black])
		await edge!.crawl('acme.example')
		navy = (await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))).opid
		black = (await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.black}`))).opid
	})

	const routes = [
		{ name: '/id', path: () => `/id/${navy}`, problem: () => `/id/${UNKNOWN_OPID}` },
		{ name: '/01', path: () => `/01/${GTINS.navy}`, problem: () => `/01/${GTINS.other}` },
		{ name: '/source', path: () => '/source/acme.example', problem: () => '/source/nobody.example' },
	]

	for (const route of routes) {
		test(`${route.name}: the JSON answer, its 304 and its problem carry it`, async () => {
			const answer = await edge!.fetch(route.path(), { headers: JSON_ACCEPT })
			expect(answer.status).toBe(200)
			expect(origin(answer)).toBe('*')

			const notModified = await revalidated(route.path(), JSON_ACCEPT)
			expect(notModified.status).toBe(304)
			expect(origin(notModified)).toBe('*')

			const problem = await edge!.fetch(route.problem(), { headers: JSON_ACCEPT })
			expect(problem.status).toBe(404)
			expect(problem.headers.get('content-type')).toContain('application/problem+json')
			expect(origin(problem)).toBe('*')
		})

		test(`${route.name}: the HTML page, its 304 and its problem page do not`, async () => {
			const page = await edge!.fetch(route.path(), { headers: HTML_ACCEPT })
			expect(page.headers.get('content-type')).toContain('text/html')
			expect(origin(page)).toBeNull()

			const notModified = await revalidated(route.path(), HTML_ACCEPT)
			expect(notModified.status).toBe(304)
			expect(origin(notModified)).toBeNull()

			const problem = await edge!.fetch(route.problem(), { headers: HTML_ACCEPT })
			expect(problem.headers.get('content-type')).toContain('text/html')
			expect(origin(problem)).toBeNull()
		})
	}

	test('/01: a problem decided by the request alone carries it too', async () => {
		const invalid = await edge!.fetch('/01/12345', { headers: JSON_ACCEPT })
		expect(invalid.status).toBe(400)
		expect(origin(invalid)).toBe('*')
		const restricted = await edge!.fetch(`/01/${GTINS.restricted}`, { headers: JSON_ACCEPT })
		expect(origin(restricted)).toBe('*')
	})

	test('/id: the 308 of a merged opid carries it when JSON was asked for, not when HTML was', async () => {
		await mergeEntities(edge!.sql, { from: black, into: navy, reason: 'test', decidedBy: 'test', now: edge!.clock.now() })
		const asJson = await edge!.fetch(`/id/${black}`, { headers: JSON_ACCEPT })
		expect(asJson.status).toBe(308)
		expect(origin(asJson)).toBe('*')
		const asHtml = await edge!.fetch(`/id/${black}`, { headers: HTML_ACCEPT })
		expect(asHtml.status).toBe(308)
		expect(origin(asHtml)).toBeNull()
	})

	test('/schemas/v0: the schema and its problem carry it', async () => {
		const schema = await edge!.fetch('/schemas/v0/org.prodid.entity.json')
		expect(schema.headers.get('content-type')).toContain('application/schema+json')
		expect(origin(schema)).toBe('*')
		const missing = await edge!.fetch('/schemas/v0/org.prodid.nothing.json', { headers: JSON_ACCEPT })
		expect(missing.status).toBe(404)
		expect(origin(missing)).toBe('*')
	})

	test('a resolver path on the media host is not a resolver answer and does not carry it', async () => {
		const onMedia = await edge!.fetchMedia(`/id/${navy}`, { headers: JSON_ACCEPT })
		expect(onMedia.status).toBe(404)
		expect(origin(onMedia)).toBeNull()
	})
})

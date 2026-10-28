import { beforeEach, describe, expect, test } from 'bun:test'

import type { SourceRecord } from '@prodid/core'

import { readIndexView } from '../src/crawl'
import { type Browser, caller, createSite, post, signedIn, type World, world } from './selfservice'

const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)

const CRAWLED: SourceRecord = {
	$type: 'org.prodid.source',
	name: 'acme.prodid.org',
	kind: 'hosted',
	trust: 'unverified',
	lapsed: false,
	license: 'CC0-1.0',
	last_crawl: {
		at: '2026-10-28T11:00:00Z',
		via: 'well-known',
		document_url: 'https://acme.prodid.org/.well-known/prodid.json',
		outcome: 'success',
		http_status: 200,
		records_seen: 4,
		records_changed: 4,
		lines_skipped: 2,
		feeds_failed: 0,
		media_failed: 3,
	},
}

let w: World
let call: ReturnType<typeof caller>
let maker: Browser

beforeEach(async () => {
	w = world()
	call = caller(w)
	maker = await signedIn(w, 'maker@example.com')
	await createSite(call, maker, 'acme')
	w.pinged.length = 0
})

const sitePage = async () => (await call('/sites/acme', { headers: { cookie: maker.cookie } })).text()
const site = async () => JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}')

describe('reading the index over HTTPS', () => {
	function fake(status: number, body?: unknown) {
		const asked: { url: string; accept: string | null }[] = []
		const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
			asked.push({ url: String(input), accept: new Headers(init?.headers).get('accept') })
			return new Response(body === undefined ? null : JSON.stringify(body), { status })
		}) as typeof fetch
		return { asked, fetcher }
	}

	test('asks the public status page of the name for JSON', async () => {
		const { asked, fetcher } = fake(200, CRAWLED)
		expect(await readIndexView('https://prodid.org/source/', 'acme.prodid.org', fetcher)).toEqual({ state: 'crawled', source: CRAWLED })
		expect(asked).toEqual([{ url: 'https://prodid.org/source/acme.prodid.org', accept: 'application/json' }])
	})

	test('a 404 is "not crawled yet"; anything else unusable is "unavailable"', async () => {
		expect(await readIndexView('https://prodid.org/source/', 'x', fake(404, { type: 'unknown-source' }).fetcher)).toEqual({
			state: 'not-crawled',
		})
		expect(await readIndexView('https://prodid.org/source/', 'x', fake(503).fetcher)).toEqual({ state: 'unavailable' })
		expect(await readIndexView('https://prodid.org/source/', 'x', fake(200, { name: 'x' }).fetcher)).toEqual({ state: 'unavailable' })
		const failing = (async () => {
			throw new TypeError('network')
		}) as unknown as typeof fetch
		expect(await readIndexView('https://prodid.org/source/', 'x', failing)).toEqual({ state: 'unavailable' })
	})
})

describe('site status', () => {
	test('a site the index has not crawled says so', async () => {
		const html = await sitePage()
		expect(w.viewed).toEqual(['acme.prodid.org'])
		expect(html).toContain('https://acme.prodid.org/.well-known/prodid.json')
		expect(html).toContain('not yet: it is served once the site has a feed')
		expect(html).toContain('Not crawled yet.')
		const list = await (await call('/sites', { headers: { cookie: maker.cookie } })).text()
		expect(list).toContain('not crawled yet')
	})

	test('a crawled site shows trust, lapse, the last crawl and its counts', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		await post(call, maker, '/sites/acme/feeds', { file: new File([feed], 'items.ndjson'), feed: 'items.ndjson', media: 'none' })
		w.views.set('acme.prodid.org', { state: 'crawled', source: CRAWLED })
		const html = await sitePage()
		expect(html).toContain('<dt>Served</dt><dd>yes</dd>')
		expect(html).toContain('<dt>Trust</dt><dd>unverified</dd>')
		expect(html).toContain('<dt>Lapsed</dt><dd>no</dd>')
		expect(html).toContain('<span class="badge ok">success</span> 2026-10-28 11:00 UTC')
		expect(html).toContain('<dt>Lines skipped</dt><dd>2</dd>')
		expect(html).toContain('<dt>Feeds failed</dt><dd>0</dd>')
		expect(html).toContain('<dt>Media failed</dt><dd>3</dd>')
		expect(html).toContain('href="https://prodid.org/source/acme.prodid.org"')
		const list = await (await call('/sites', { headers: { cookie: maker.cookie } })).text()
		expect(list).toContain('<span class="badge ok">success</span>')
	})

	test('a lapsed source shows since when', async () => {
		w.views.set('acme.prodid.org', {
			state: 'crawled',
			source: {
				...CRAWLED,
				lapsed: true,
				lapsed_at: '2026-10-20T00:00:00Z',
				last_crawl: { at: '2026-10-28T11:00:00Z', outcome: 'definite-negative' },
			},
		})
		const html = await sitePage()
		expect(html).toContain('since 2026-10-20 00:00 UTC')
		expect(html).toContain('nothing served')
	})

	test('a verified site is looked up under its domain', async () => {
		w.txt.set('_prodid.acme.example', ['v=prodid0; host=acme.prodid.org'])
		await post(call, maker, '/sites/acme/domain', { domain: 'acme.example', action: 'save' })
		await post(call, maker, '/sites/acme/verify', {})
		w.viewed.length = 0
		await sitePage()
		expect(w.viewed).toEqual(['acme.example'])
	})
})

describe('site settings', () => {
	test('edits the publisher name, contact and licence, keeping the domain and its verification', async () => {
		w.txt.set('_prodid.acme.example', ['v=prodid0; host=acme.prodid.org'])
		await post(call, maker, '/sites/acme/domain', { domain: 'acme.example', action: 'save' })
		await post(call, maker, '/sites/acme/verify', {})
		w.pinged.length = 0

		const saved = await post(call, maker, '/sites/acme/settings', {
			name: 'Acme Outdoor',
			contact: 'data@acme.example',
			license: 'other',
			other: 'CC-BY-SA-4.0',
		})
		expect(saved.status).toBe(303)
		expect(await site()).toMatchObject({
			publisher: { name: 'Acme Outdoor', contact: 'data@acme.example' },
			license: 'CC-BY-SA-4.0',
			domain: 'acme.example',
			verified: 'acme.example',
		})
		expect(w.pinged).toEqual([['acme.prodid.org', 'acme.example']])
		const html = await sitePage()
		expect(html).toContain('value="Acme Outdoor"')
		expect(html).toContain('value="CC-BY-SA-4.0"')
	})

	test('a refused value is shown and nothing changes', async () => {
		const before = await site()
		const refused = await post(call, maker, '/sites/acme/settings', { name: '', contact: 'x@example.com', license: 'CC0-1.0', other: '' })
		expect(refused.status).toBe(400)
		expect(await refused.text()).toContain('The settings were refused.')
		expect(await site()).toEqual(before)
	})

	test('another account cannot change the settings, and the form needs its token', async () => {
		const other = await signedIn(w, 'other@example.com')
		const fields = { name: 'Taken', contact: 'x@example.com', license: 'CC0-1.0', other: '' }
		expect((await post(call, other, '/sites/acme/settings', fields)).status).toBe(404)
		expect((await post(call, maker, '/sites/acme/settings', fields, 'https://evil.example')).status).toBe(403)
		expect((await site()).publisher.name).toBe('Acme Tekstil')
	})
})

import { beforeEach, describe, expect, test } from 'bun:test'

import { releaseUnused } from '../src/unused'
import { type Browser, caller, createSite, post, signedIn, TOKEN, type World, world } from './selfservice'

const FEED = new URL('../../../spec/fixtures/merchant/feed.ndjson', import.meta.url)

let w: World
let call: ReturnType<typeof caller>
let maker: Browser
let mails: { to: string; subject: string; text: string }[]

beforeEach(async () => {
	w = world()
	call = caller(w)
	mails = []
	w.services.mail = {
		async send(to, subject, text) {
			mails.push({ to, subject, text })
		},
	}
	maker = await signedIn(w, 'maker@example.com')
	expect((await createSite(call, maker, 'acme')).status).toBe(303)
})

const at = (iso: string) => {
	w.clock.now = new Date(iso)
}
const run = () => releaseUnused(w.services)

async function upload(browser = maker, slug = 'acme') {
	const file = new File([await Bun.file(FEED).arrayBuffer()], 'items.ndjson')
	return post(call, browser, `/sites/${slug}/feeds`, { file, feed: 'items.ndjson', lang: '', markets: '', media: 'none' })
}

describe('unused slugs', () => {
	test('a site with no feed is reminded on day 23 and released on day 30', async () => {
		at('2026-11-20T11:59:59.999Z')
		expect(await run()).toEqual({ reminded: [], released: [] })
		expect(mails).toEqual([])

		at('2026-11-20T12:00:00.000Z')
		expect(await run()).toEqual({ reminded: ['acme'], released: [] })
		expect(mails).toHaveLength(1)
		expect(mails[0]?.to).toBe('maker@example.com')
		expect(mails[0]?.subject).toBe('prodid: acme.prodid.org has no feed yet')
		expect(mails[0]?.text).toContain('Upload a feed before 2026-11-27 to keep acme.prodid.org')
		expect(mails[0]?.text).toContain('https://publish.prodid.org/sites/acme')

		at('2026-11-21T03:17:00.000Z')
		expect(await run()).toEqual({ reminded: [], released: [] })
		expect(mails).toHaveLength(1)

		at('2026-11-27T11:59:59.999Z')
		expect(await run()).toEqual({ reminded: [], released: [] })
		expect(await w.blobs.text('sites/acme/site.json')).not.toBeNull()

		at('2026-11-27T12:00:00.000Z')
		expect(await run()).toEqual({ reminded: [], released: ['acme'] })
		expect(await w.blobs.text('sites/acme/site.json')).toBeNull()
		expect(await w.sql.all('select * from site')).toEqual([])
		expect((await call('/sites', { headers: { cookie: maker.cookie } })).status).toBe(200)
		expect(await (await call('/sites', { headers: { cookie: maker.cookie } })).text()).toContain('You have no sites yet')

		const other = await signedIn(w, 'other@example.com')
		expect((await createSite(call, other, 'acme')).status).toBe(303)
		expect(mails).toHaveLength(1)
	})

	test('a slug the index already lists is held for nobody once released', async () => {
		w.views.set('acme.prodid.org', {
			state: 'crawled',
			source: {
				$type: 'org.prodid.source',
				name: 'acme.prodid.org',
				kind: 'hosted',
				trust: 'unverified',
				lapsed: false,
				license: 'CC0-1.0',
				last_crawl: {
					at: '2026-11-01T03:00:00Z',
					via: 'well-known',
					document_url: 'https://acme.prodid.org/.well-known/prodid.json',
					outcome: 'definite-negative',
					http_status: 404,
				},
			},
		})
		at('2026-11-20T12:00:00.000Z')
		await run()
		at('2026-11-27T12:00:00.000Z')
		expect((await run()).released).toEqual(['acme'])
		expect(await w.sql.all('select slug, account_id, deleted_at from site')).toEqual([
			{ slug: 'acme', account_id: null, deleted_at: '2026-11-27T12:00:00.000Z' },
		])
		expect((await createSite(call, maker, 'acme')).status).toBe(409)
		at('2026-12-27T12:00:00.000Z')
		expect((await createSite(call, maker, 'acme')).status).toBe(303)
	})

	test('a reminder sent late still gives a week', async () => {
		at('2026-12-15T03:17:00.000Z')
		expect((await run()).reminded).toEqual(['acme'])
		expect(mails[0]?.text).toContain('Upload a feed before 2026-12-22')
		at('2026-12-21T03:17:00.000Z')
		expect((await run()).released).toEqual([])
		at('2026-12-22T03:17:00.000Z')
		expect((await run()).released).toEqual(['acme'])
	})

	test('a site with a feed is neither reminded nor released', async () => {
		expect((await upload()).status).toBe(200)
		at('2026-11-20T12:00:00.000Z')
		await run()
		at('2027-01-01T12:00:00.000Z')
		expect(await run()).toEqual({ reminded: [], released: [] })
		expect(mails).toEqual([])
		expect(await w.blobs.text('sites/acme/site.json')).not.toBeNull()
	})

	test('a feed after the reminder keeps the site, and a site that empties again is reminded again', async () => {
		at('2026-11-20T12:00:00.000Z')
		await run()
		expect((await upload()).status).toBe(200)
		at('2026-11-27T12:00:00.000Z')
		expect(await run()).toEqual({ reminded: [], released: [] })
		expect(await w.sql.all('select reminded_at from site')).toEqual([{ reminded_at: null }])

		expect((await post(call, maker, '/sites/acme/feeds/items.ndjson/delete', {})).status).toBe(303)
		at('2026-11-28T12:00:00.000Z')
		expect((await run()).reminded).toEqual(['acme'])
		at('2026-12-05T11:59:59.999Z')
		expect((await run()).released).toEqual([])
		at('2026-12-05T12:00:00.000Z')
		expect((await run()).released).toEqual(['acme'])
	})

	test('a failed reminder is sent again the next day, and nothing is released without one', async () => {
		w.services.mail = {
			async send() {
				throw new Error('mail down')
			},
		}
		at('2026-11-20T12:00:00.000Z')
		expect((await run()).reminded).toEqual([])
		at('2026-11-30T12:00:00.000Z')
		expect(await run()).toEqual({ reminded: [], released: [] })
		expect(await w.blobs.text('sites/acme/site.json')).not.toBeNull()

		w.services.mail = {
			async send(to, subject, text) {
				mails.push({ to, subject, text })
			},
		}
		at('2026-12-01T12:00:00.000Z')
		expect((await run()).reminded).toEqual(['acme'])
		expect(mails[0]?.text).toContain('Upload a feed before 2026-12-08')
	})

	test('a site the operator made, with no owner, is left alone', async () => {
		await call('/sites/operated', {
			method: 'PUT',
			headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
			body: JSON.stringify({ publisher: { name: 'Operated' }, license: 'CC0-1.0' }),
		})
		at('2027-01-01T12:00:00.000Z')
		await run()
		at('2027-01-09T12:00:00.000Z')
		expect((await run()).released).toEqual(['acme'])
		expect(await w.blobs.text('sites/operated/site.json')).not.toBeNull()
	})
})

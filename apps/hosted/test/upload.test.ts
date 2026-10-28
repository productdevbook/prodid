import { beforeEach, describe, expect, test } from 'bun:test'

import { type Browser, caller, createSite, post, signedIn, TOKEN, type World, world } from './selfservice'

const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)

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

async function fixture(name: string): Promise<File> {
	return new File([await Bun.file(new URL(name, MERCHANT)).arrayBuffer()], name)
}

function upload(file: File, fields: Record<string, string> = {}, browser = maker, slug = 'acme') {
	return post(call, browser, `/sites/${slug}/feeds`, { file, feed: 'items.ndjson', lang: '', markets: '', media: 'none', ...fields })
}

const stored = async (name = 'items.ndjson') => w.blobs.text(`sites/acme/feeds/${name}`)

describe('uploading a Merchant file', () => {
	test('the fixture with its declared values stores exactly the fixture feed and reports row 6 skipped', async () => {
		const response = await upload(await fixture('feed.csv'), { lang: 'en', markets: 'TR', media: 'CC-BY-4.0' })
		expect(response.status).toBe(200)
		const expected = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		expect(await stored()).toBe(expected)

		const html = await response.text()
		const items = expected.trimEnd().split('\n').length
		expect(html).toContain(`${items} items written.`)
		expect(html).toContain('1 row was skipped:')
		expect(html).toMatch(/Row 6: [^<]+</)
		expect(html).toContain('href="https://acme.prodid.org/feeds/items.ndjson"')

		const site = JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}')
		expect(site.feeds).toEqual(['items.ndjson'])
		expect(w.pinged).toEqual([['acme.prodid.org']])
		expect((await call('/.well-known/prodid.json', {}, 'acme.prodid.org')).status).toBe(200)

		const again = await (await call('/sites/acme', { headers: { cookie: maker.cookie } })).text()
		expect(again).toContain(`<dt>Items</dt><dd>${items}</dd>`)
	})

	test('a TSV is read as a Merchant file too', async () => {
		const tsv = 'id\ttitle\tbrand\nTJ-1\tTrail Jacket, navy\tAcme\n'
		const response = await upload(new File([tsv], 'feed.tsv'), { lang: 'en' })
		expect(response.status).toBe(200)
		expect(await stored()).toContain('"key":"TJ-1","brand":"Acme","name":"Trail Jacket, navy"')
	})

	test('without a media licence the media is left out and reported', async () => {
		const response = await upload(await fixture('feed.csv'), { lang: 'en' })
		expect(response.status).toBe(200)
		expect(await stored()).not.toContain('"media"')
		expect(await response.text()).toContain('Values with no place in a record were left out:')
	})

	test('a bad market code or a licence outside the list stores nothing', async () => {
		const market = await upload(await fixture('feed.csv'), { markets: 'TR, Turkey' })
		expect(market.status).toBe(400)
		expect(await market.text()).toContain('TURKEY is not an ISO 3166-1 alpha-2 country code.')
		expect((await upload(await fixture('feed.csv'), { media: 'All rights reserved' })).status).toBe(400)
		expect(await stored()).toBeNull()
	})

	test('a file with no convertible row stores nothing', async () => {
		const response = await upload(new File(['id,title\n,Nameless\n'], 'feed.csv'))
		expect(response.status).toBe(400)
		const html = await response.text()
		expect(html).toContain('No row could be converted.')
		expect(html).toContain('Row 2: no id')
		expect(await stored()).toBeNull()
	})
})

describe('uploading an NDJSON feed', () => {
	test('is stored after validation, and replacing keeps one entry', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		expect((await upload(new File([feed], 'catalogue.ndjson'))).status).toBe(200)
		expect(await stored()).toBe(feed)
		const one = `${feed.split('\n')[0]}\n`
		const replaced = await upload(new File([one], 'catalogue.ndjson'))
		expect(await replaced.text()).toContain('1 item written.')
		expect(await stored()).toBe(one)
		expect(JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}').feeds).toEqual(['items.ndjson'])
	})

	test('an invalid line is reported with its number and nothing is stored', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		const response = await upload(new File([`${feed.split('\n')[0]}\n{"$type":"org.prodid.item"}\n`], 'items.ndjson'))
		expect(response.status).toBe(400)
		const html = await response.text()
		expect(html).toContain('The feed was refused.')
		expect(html).toContain('Line 2: ')
		expect(await stored()).toBeNull()
	})

	test('a file of another kind, a bad feed name, or the hundred-and-first feed is refused', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		expect((await upload(new File([feed], 'items.json'))).status).toBe(400)
		expect((await upload(new File([feed], 'items.ndjson'), { feed: 'Items.ndjson' })).status).toBe(400)
		const site = JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}')
		site.feeds = Array.from({ length: 100 }, (_, index) => `feed-${index}.ndjson`)
		await w.blobs.put('sites/acme/site.json', JSON.stringify(site), 'application/json')
		expect((await upload(new File([feed], 'items.ndjson'))).status).toBe(409)
		expect(await stored()).toBeNull()
	})

	test('a body larger than a feed is refused before it is read', async () => {
		const response = await call('/sites/acme/feeds', {
			method: 'POST',
			headers: { cookie: maker.cookie, origin: 'https://publish.prodid.org', 'content-length': String(40 * 1024 * 1024) },
			body: 'x',
		})
		expect(response.status).toBe(413)
		expect(await response.text()).toContain('A feed is at most 32 MiB.')
	})
})

describe('feeds of a site', () => {
	test('another account can neither upload to nor delete from the site', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		await upload(new File([feed], 'items.ndjson'))
		const other = await signedIn(w, 'other@example.com')
		expect((await upload(new File([feed], 'items.ndjson'), {}, other)).status).toBe(404)
		expect((await post(call, other, '/sites/acme/feeds/items.ndjson/delete', {})).status).toBe(404)
		expect(await stored()).toBe(feed)
	})

	test('delete removes the feed and its listing, and needs the form token', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		await upload(new File([feed], 'items.ndjson'))
		expect((await post(call, maker, '/sites/acme/feeds/items.ndjson/delete', {}, 'https://evil.example')).status).toBe(403)
		const deleted = await post(call, maker, '/sites/acme/feeds/items.ndjson/delete', {})
		expect(deleted.status).toBe(303)
		expect(await stored()).toBeNull()
		expect((await call('/.well-known/prodid.json', {}, 'acme.prodid.org')).status).toBe(404)
	})

	test('replace opens the upload form with the feed name filled in', async () => {
		const html = await (await call('/sites/acme?feed=spring.ndjson', { headers: { cookie: maker.cookie } })).text()
		expect(html).toContain('name="feed" type="text" required="" autocomplete="off" autocapitalize="none" value="spring.ndjson"')
	})

	test('a feed the operator uploaded shows its item count too', async () => {
		const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
		await call('/sites/acme/feeds/items.ndjson', { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}` }, body: feed })
		const html = await (await call('/sites/acme', { headers: { cookie: maker.cookie } })).text()
		expect(html).toContain(`<dt>Items</dt><dd>${feed.trimEnd().split('\n').length}</dd>`)
	})
})

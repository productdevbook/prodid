import { beforeEach, describe, expect, test } from 'bun:test'

import { type Browser, caller, createSite, post, signedIn, type World, world } from './selfservice'

const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)
const TXT = '_prodid.acme.example'

let w: World
let call: ReturnType<typeof caller>
let maker: Browser

beforeEach(async () => {
	w = world()
	call = caller(w)
	maker = await signedIn(w, 'maker@example.com')
	await createSite(call, maker, 'acme')
	const feed = await Bun.file(new URL('feed.ndjson', MERCHANT)).text()
	await post(call, maker, '/sites/acme/feeds', { file: new File([feed], 'items.ndjson'), feed: 'items.ndjson', media: 'none' })
	w.pinged.length = 0
})

const site = async () => JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}')
const served = async () => (await call('/.well-known/prodid.json', {}, 'acme.prodid.org')).json()
const sitePage = async () => (await call('/sites/acme', { headers: { cookie: maker.cookie } })).text()
const save = (domain: string) => post(call, maker, '/sites/acme/domain', { domain, action: 'save' })
const check = () => post(call, maker, '/sites/acme/verify', {})
const later = (seconds: number) => {
	w.clock.now = new Date(w.clock.now.getTime() + seconds * 1000)
}

describe('connecting a domain', () => {
	test('saving shows the exact TXT record to add and waits for DNS', async () => {
		const saved = await save('Acme.Example')
		expect(saved.status).toBe(303)
		expect((await site()).domain).toBe('acme.example')
		const html = await sitePage()
		expect(html).toContain('_prodid.acme.example  TXT  &quot;v=prodid0; host=acme.prodid.org&quot;')
		expect(html).toContain('waiting for DNS')
		expect(await served()).not.toHaveProperty('domain')
		expect(w.pinged).toEqual([['acme.prodid.org', 'acme.example']])
	})

	test('a domain that is not a domain, or inside the hosting zone, is refused', async () => {
		const url = await save('https://acme.example/shop')
		expect(url.status).toBe(400)
		expect(await url.text()).toContain('without https:// or a path')
		const inside = await save('other.prodid.org')
		expect(inside.status).toBe(400)
		expect(await inside.text()).toContain('use a domain of your own')
		expect(await site()).not.toHaveProperty('domain')
	})

	test('another account cannot set or check the domain', async () => {
		const other = await signedIn(w, 'other@example.com')
		expect((await post(call, other, '/sites/acme/domain', { domain: 'evil.example', action: 'save' })).status).toBe(404)
		await save('acme.example')
		expect((await post(call, other, '/sites/acme/verify', {})).status).toBe(404)
		expect(w.lookups).toEqual([])
	})
})

describe('check now', () => {
	beforeEach(async () => {
		await save('acme.example')
		w.pinged.length = 0
	})

	test('with no record, says so and lists no TXT values', async () => {
		const response = await check()
		expect(response.status).toBe(200)
		const html = await response.text()
		expect(html).toContain('No prodid record yet.')
		expect(html).toContain('TXT values found at <span class="mono">_prodid.acme.example</span>: none.')
		expect(w.lookups).toEqual([TXT])
		expect(await site()).not.toHaveProperty('verified')
	})

	test('with a record to another host, shows the record and stays unverified', async () => {
		w.txt.set(TXT, ['v=prodid0; host=elsewhere.example'])
		const html = await (await check()).text()
		expect(html).toContain('The record names elsewhere.example, not acme.prodid.org.')
		expect(html).toContain('<li class="mono">v=prodid0; host=elsewhere.example</li>')
		expect(await site()).not.toHaveProperty('verified')
		expect(await served()).not.toHaveProperty('domain')
	})

	test('with the right record, verifies the site, names the domain in the document, and pings', async () => {
		w.txt.set(TXT, ['v=prodid0; host=acme.prodid.org', ['google-site-', 'verification=x']])
		const response = await check()
		const html = await response.text()
		expect(html).toContain('Verified: acme.example delegates to acme.prodid.org')
		expect(html).toContain('<li class="mono">v=prodid0; host=acme.prodid.org</li>')
		expect(html).toContain('<li class="mono">google-site-verification=x</li>')
		expect(html).toContain('<span class="badge ok">verified</span>')
		expect(await site()).toMatchObject({ verified: 'acme.example', verifiedAt: '2026-10-28T12:00:00.000Z' })
		expect(await served()).toMatchObject({ domain: 'acme.example' })
		expect(w.pinged).toEqual([['acme.prodid.org', 'acme.example']])
	})

	test('on SERVFAIL, changes nothing in either direction', async () => {
		w.txt.set(TXT, ['v=prodid0; host=acme.prodid.org'])
		await check()
		later(60)
		w.txt.set(TXT, 'servfail')
		const html = await (await check()).text()
		expect(html).toContain('The DNS lookup failed (servfail). Nothing was changed')
		expect(html).not.toContain('TXT values found')
		expect(await site()).toMatchObject({ verified: 'acme.example' })
		expect(await served()).toMatchObject({ domain: 'acme.example' })
	})

	test('runs at most once a minute per site', async () => {
		expect((await check()).status).toBe(200)
		later(20)
		const again = await check()
		expect(again.status).toBe(429)
		expect(await again.text()).toContain('Try again in 40 seconds.')
		expect(w.lookups).toEqual([TXT])
		later(40)
		expect((await check()).status).toBe(200)
		expect(w.lookups).toEqual([TXT, TXT])
	})

	test('needs the form token', async () => {
		expect((await post(call, maker, '/sites/acme/verify', {}, 'https://evil.example')).status).toBe(403)
		expect(w.lookups).toEqual([])
	})
})

describe('removing the domain', () => {
	test('unverifies the site and the document stops naming the domain', async () => {
		await save('acme.example')
		w.txt.set(TXT, ['v=prodid0; host=acme.prodid.org'])
		await check()
		expect(await served()).toMatchObject({ domain: 'acme.example' })
		w.pinged.length = 0

		const removed = await post(call, maker, '/sites/acme/domain', { action: 'remove' })
		expect(removed.status).toBe(303)
		const stored = await site()
		expect(stored).not.toHaveProperty('domain')
		expect(stored).not.toHaveProperty('verified')
		expect(stored).not.toHaveProperty('verifiedAt')
		expect(await served()).not.toHaveProperty('domain')
		expect(w.pinged).toEqual([['acme.prodid.org', 'acme.example']])
		expect(await sitePage()).not.toContain('Check now')
	})

	test('saving another domain drops the old verification', async () => {
		await save('acme.example')
		w.txt.set(TXT, ['v=prodid0; host=acme.prodid.org'])
		await check()
		await save('other.example')
		expect(await site()).not.toHaveProperty('verified')
		expect(await served()).not.toHaveProperty('domain')
	})
})

import { beforeEach, describe, expect, test } from 'bun:test'

import { caller, createSite, post, signedIn, TOKEN, type World, world } from './selfservice'

let w: World
let call: ReturnType<typeof caller>

beforeEach(() => {
	w = world()
	call = caller(w)
})

const page = async (response: Response) => ({ status: response.status, html: await response.text() })

describe('/sites/{slug} on the operator host', () => {
	test('is the operator endpoint with Authorization and the page without it', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		expect((await createSite(call, maker, 'acme')).status).toBe(303)

		const operator = await call('/sites/acme', { headers: { authorization: `Bearer ${TOKEN}` } })
		expect(operator.headers.get('content-type')).toStartWith('application/json')
		expect(await operator.json()).toMatchObject({ site: { slug: 'acme', owner: maker.accountId }, host: 'acme.prodid.org' })

		const browser = await call('/sites/acme', { headers: { cookie: maker.cookie } })
		expect(browser.status).toBe(200)
		expect(browser.headers.get('content-type')).toStartWith('text/html')
		expect(await browser.text()).toContain('https://acme.prodid.org/.well-known/prodid.json')

		const signedOut = await call('/sites/acme')
		expect(signedOut.status).toBe(303)
		expect(signedOut.headers.get('location')).toBe('/')
		expect((await call('/sites/acme', { headers: { authorization: 'Bearer wrong', cookie: maker.cookie } })).status).toBe(401)
	})

	test('keeps the owner when the operator rewrites the settings', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		await createSite(call, maker, 'acme')
		const put = await call('/sites/acme', {
			method: 'PUT',
			headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
			body: JSON.stringify({ publisher: { name: 'Acme' }, license: 'CC0-1.0' }),
		})
		expect(await put.json()).toMatchObject({ site: { owner: maker.accountId, publisher: { name: 'Acme' } } })
	})
})

describe('your sites', () => {
	test('an empty list offers a new site', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		const { status, html } = await page(await call('/sites', { headers: { cookie: maker.cookie } }))
		expect(status).toBe(200)
		expect(html).toContain('You have no sites yet')
		expect(html).toContain('href="/sites/new"')
	})

	test('a new site is stored with its owner, listed, and announced', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		const form = await page(await call('/sites/new', { headers: { cookie: maker.cookie } }))
		expect(form.html).toContain('value="maker@example.com"')
		expect(form.html).toContain('CC0-1.0 (recommended)')

		const created = await createSite(call, maker, 'acme', { license: 'other', other: 'ODbL-1.0' })
		expect(created.status).toBe(303)
		expect(created.headers.get('location')).toBe('/sites/acme')
		expect(JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? 'null')).toEqual({
			slug: 'acme',
			owner: maker.accountId,
			publisher: { name: 'Acme Tekstil', contact: 'maker@example.com' },
			license: 'ODbL-1.0',
			feeds: [],
			updatedAt: '2026-10-28T12:00:00.000Z',
		})
		expect(await w.sql.all('select slug, account_id, deleted_at from site')).toEqual([
			{ slug: 'acme', account_id: maker.accountId, deleted_at: null },
		])
		expect(w.pinged).toEqual([['acme.prodid.org']])

		const list = await page(await call('/sites', { headers: { cookie: maker.cookie } }))
		expect(list.html).toContain('href="/sites/acme"')
		expect(list.html).toContain('acme.prodid.org')
		expect(list.html).not.toContain('You have no sites yet')
	})

	test('another account sees neither the site nor its page', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		const other = await signedIn(w, 'other@example.com')
		await createSite(call, maker, 'acme')
		expect((await page(await call('/sites', { headers: { cookie: other.cookie } }))).html).not.toContain('acme.prodid.org')
		const theirs = await page(await call('/sites/acme', { headers: { cookie: other.cookie } }))
		const nobodys = await page(await call('/sites/nobody', { headers: { cookie: other.cookie } }))
		expect(theirs.status).toBe(404)
		expect(nobodys.status).toBe(404)
		expect(theirs.html).toBe(nobodys.html)
	})

	test('an account holds at most five sites', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		for (const slug of ['one-shop', 'two-shop', 'three-shop', 'four-shop', 'five-shop']) {
			expect((await createSite(call, maker, slug)).status).toBe(303)
		}
		const sixth = await page(await createSite(call, maker, 'six-shop'))
		expect(sixth.status).toBe(409)
		expect(sixth.html).toContain('You already have 5 sites')
		expect(await w.blobs.text('sites/six-shop/site.json')).toBeNull()

		const list = await page(await call('/sites', { headers: { cookie: maker.cookie } }))
		expect(list.html).not.toContain('href="/sites/new"')
		expect(list.html).toContain('the most one account can hold')
		expect((await page(await call('/sites/new', { headers: { cookie: maker.cookie } }))).html).not.toContain('action="/sites"')

		const other = await signedIn(w, 'other@example.com')
		expect((await createSite(call, other, 'six-shop')).status).toBe(303)
	})
})

describe('slug errors', () => {
	test('a slug the rules refuse is shown with its reason, and nothing is stored', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		for (const [slug, text] of [
			['Acme', 'Use 3 to 32 lowercase letters'],
			['ab', 'Use 3 to 32 lowercase letters'],
			['xn--acme', 'reserved for internationalised names'],
			['admin', 'This name is reserved'],
			['pr0did-shop', 'This name is reserved'],
			['new', 'This name is reserved'],
		] as const) {
			const refused = await page(await createSite(call, maker, slug))
			expect(refused.status).toBe(400)
			expect(refused.html).toContain(text)
			expect(refused.html).toContain(`value="${slug}"`)
		}
		expect(w.blobs.objects.size).toBe(0)
		expect(await w.sql.all('select * from site')).toEqual([])
	})

	test('a slug in use, by an account or by the operator, is taken', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		const other = await signedIn(w, 'other@example.com')
		await createSite(call, maker, 'acme')
		const taken = await page(await createSite(call, other, 'acme'))
		expect(taken.status).toBe(409)
		expect(taken.html).toContain('This name is already in use.')

		await call('/sites/operated', {
			method: 'PUT',
			headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
			body: JSON.stringify({ publisher: { name: 'Operated' }, license: 'CC0-1.0' }),
		})
		expect((await createSite(call, other, 'operated')).status).toBe(409)
		expect(JSON.parse((await w.blobs.text('sites/operated/site.json')) ?? '{}')).not.toHaveProperty('owner')
	})

	test('a deleted site holds its slug for thirty days against everyone but its owner', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		const other = await signedIn(w, 'other@example.com')
		await createSite(call, maker, 'acme')
		expect((await call('/sites/acme', { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(204)
		expect((await page(await call('/sites', { headers: { cookie: maker.cookie } }))).html).not.toContain('acme.prodid.org')

		const held = await page(await createSite(call, other, 'acme'))
		expect(held.status).toBe(409)
		expect(held.html).toContain('held until the index has let it go')

		w.clock.now = new Date('2026-11-27T11:59:59.000Z')
		expect((await createSite(call, other, 'acme')).status).toBe(409)
		expect((await createSite(call, maker, 'acme')).status).toBe(303)
	})

	test('a slug nobody owned is held after the operator deletes it, then released', async () => {
		await call('/sites/operated', {
			method: 'PUT',
			headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
			body: JSON.stringify({ publisher: { name: 'Operated' }, license: 'CC0-1.0' }),
		})
		await call('/sites/operated', { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } })
		const maker = await signedIn(w, 'maker@example.com')
		expect((await createSite(call, maker, 'operated')).status).toBe(409)
		w.clock.now = new Date('2026-11-27T12:00:00.000Z')
		expect((await createSite(call, maker, 'operated')).status).toBe(303)
	})

	test('/slug-check answers from checkSlug', async () => {
		const check = async (slug: string) => (await call(`/slug-check?slug=${encodeURIComponent(slug)}`)).json()
		expect(await check('acme')).toEqual({ ok: true, reason: null })
		expect(await check('Acme')).toEqual({ ok: false, reason: 'grammar' })
		expect(await check('xn--acme')).toEqual({ ok: false, reason: 'reserved-ldh' })
		expect(await check('prodid-shop')).toEqual({ ok: false, reason: 'reserved' })
		expect(await check('')).toEqual({ ok: false, reason: 'grammar' })
	})

	test('a refused publisher or licence is shown and nothing is stored', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		const refused = await page(await createSite(call, maker, 'acme', { name: '' }))
		expect(refused.status).toBe(400)
		expect(refused.html).toContain('The publisher or the licence was refused')
		expect(await w.sql.all('select * from site')).toEqual([])
	})

	test('a form from another origin or without the token creates nothing', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		expect((await post(call, maker, '/sites', { slug: 'acme', name: 'Acme', license: 'CC0-1.0' }, 'https://evil.example')).status).toBe(403)
		expect(
			(await post(call, { ...maker, form: 'f'.repeat(64) }, '/sites', { slug: 'acme', name: 'Acme', license: 'CC0-1.0' })).status,
		).toBe(403)
		expect(w.blobs.objects.size).toBe(0)
	})
})

import { beforeEach, describe, expect, test } from 'bun:test'

import { type Browser, caller, createSite, post, signedIn, type World, world } from './selfservice'

let w: World
let call: ReturnType<typeof caller>
let maker: Browser

beforeEach(async () => {
	w = world()
	call = caller(w)
	maker = await signedIn(w, 'maker@example.com')
	await createSite(call, maker, 'acme')
	const feed = new File(
		[await Bun.file(new URL('../../../spec/fixtures/merchant/feed.ndjson', import.meta.url)).arrayBuffer()],
		'items.ndjson',
	)
	expect(
		(await post(call, maker, '/sites/acme/feeds', { file: feed, feed: 'items.ndjson', lang: '', markets: '', media: 'none' })).status,
	).toBe(200)
	w.pinged.length = 0
})

const page = async (response: Response) => ({ status: response.status, html: await response.text() })
const deleteSite = (confirm: string, browser = maker) => post(call, browser, '/sites/acme/delete', { confirm })

describe('deleting a site', () => {
	test('the site page states what follows and asks for the slug', async () => {
		const { html } = await page(await call('/sites/acme', { headers: { cookie: maker.cookie } }))
		expect(html).toContain('Its document and feeds stop being served at once.')
		expect(html).toContain('The index sees a definite negative on its next crawl, and the source lapses.')
		expect(html).toContain('Its claims are withdrawn after 30 days, unless it publishes again.')
		expect(html).toContain('For those 30 days nobody else can take the name <span class="mono">acme</span>.')
		expect(html).toContain('action="/sites/acme/delete"')
	})

	test('a wrong confirmation is refused and deletes nothing', async () => {
		for (const confirm of ['', 'Acme', 'acme.prodid.org', 'acm']) {
			const refused = await page(await deleteSite(confirm))
			expect(refused.status).toBe(400)
			expect(refused.html).toContain('Nothing was deleted.')
		}
		expect(await w.blobs.text('sites/acme/site.json')).not.toBeNull()
		expect(await w.blobs.text('sites/acme/feeds/items.ndjson')).not.toBeNull()
		expect(await w.sql.all('select slug, deleted_at from site')).toEqual([{ slug: 'acme', deleted_at: null }])
		expect(w.pinged).toEqual([])
	})

	test('the slug confirms it: everything is removed, the index is told, and the slug is held', async () => {
		const deleted = await deleteSite('acme')
		expect(deleted.status).toBe(303)
		expect(deleted.headers.get('location')).toBe('/sites?deleted=acme')
		expect([...w.blobs.objects.keys()].filter((key) => key.startsWith('sites/acme/'))).toEqual([])
		expect(await w.sql.all('select slug, account_id, deleted_at from site')).toEqual([
			{ slug: 'acme', account_id: maker.accountId, deleted_at: '2026-10-28T12:00:00.000Z' },
		])
		expect(w.pinged).toEqual([['acme.prodid.org']])
		expect((await call('/.well-known/prodid.json', {}, 'acme.prodid.org')).status).toBe(404)
		expect((await call('/feeds/items.ndjson', {}, 'acme.prodid.org')).status).toBe(404)

		const list = await page(await call('/sites?deleted=acme', { headers: { cookie: maker.cookie } }))
		expect(list.html).toContain('acme.prodid.org</span> was deleted.')
		expect(list.html).not.toContain('href="/sites/acme"')
		expect((await call('/sites/acme', { headers: { cookie: maker.cookie } })).status).toBe(404)
	})

	test('a held slug is refused to others for thirty days, then released', async () => {
		await deleteSite('acme')
		const other = await signedIn(w, 'other@example.com')
		const held = await page(await createSite(call, other, 'acme'))
		expect(held.status).toBe(409)
		expect(held.html).toContain('held until the index has let it go')

		w.clock.now = new Date('2026-11-27T11:59:59.999Z')
		expect((await createSite(call, other, 'acme')).status).toBe(409)
		w.clock.now = new Date('2026-11-27T12:00:00.000Z')
		expect((await createSite(call, other, 'acme')).status).toBe(303)
		expect(JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}')).toMatchObject({ owner: other.accountId, feeds: [] })
	})

	test('another account cannot delete it, nor can a form from another origin', async () => {
		const other = await signedIn(w, 'other@example.com')
		expect((await deleteSite('acme', other)).status).toBe(404)
		expect((await post(call, maker, '/sites/acme/delete', { confirm: 'acme' }, 'https://evil.example')).status).toBe(403)
		expect(await w.blobs.text('sites/acme/site.json')).not.toBeNull()
	})

	test('the notice shows only for a site this account deleted', async () => {
		expect((await page(await call('/sites?deleted=acme', { headers: { cookie: maker.cookie } }))).html).not.toContain('was deleted.')
		expect((await page(await call('/sites?deleted=nobody', { headers: { cookie: maker.cookie } }))).html).not.toContain('was deleted.')
	})
})

describe('deleting an account', () => {
	test('is refused while the account owns a site', async () => {
		const account = await page(await call('/account', { headers: { cookie: maker.cookie } }))
		expect(account.html).toContain('This account owns 1 site.')
		expect(account.html).not.toContain('action="/account/delete"')

		const refused = await page(await post(call, maker, '/account/delete', {}))
		expect(refused.status).toBe(409)
		expect(refused.html).toContain('The account was not deleted.')
		expect(await w.sql.first('select id from account where id = ?', maker.accountId)).not.toBeNull()
	})

	test('an account that owns no site is deleted with its sessions', async () => {
		await deleteSite('acme')
		const account = await page(await call('/account', { headers: { cookie: maker.cookie } }))
		expect(account.html).toContain('action="/account/delete"')

		const deleted = await post(call, maker, '/account/delete', {})
		expect(deleted.status).toBe(200)
		expect(await deleted.text()).toContain('Account deleted')
		expect(deleted.headers.get('set-cookie')).toStartWith('__Host-session=; Max-Age=0')
		expect(await w.sql.all('select * from account where id = ?', maker.accountId)).toEqual([])
		expect(await w.sql.all('select * from session where account_id = ?', maker.accountId)).toEqual([])
		expect(await w.sql.all('select slug, account_id from site')).toEqual([{ slug: 'acme', account_id: null }])

		const after = await call('/sites', { headers: { cookie: maker.cookie } })
		expect(after.status).toBe(303)
		expect(after.headers.get('location')).toBe('/')
	})

	test('needs the form token and the origin', async () => {
		await deleteSite('acme')
		expect((await post(call, maker, '/account/delete', {}, 'https://evil.example')).status).toBe(403)
		expect((await post(call, { ...maker, form: 'f'.repeat(64) }, '/account/delete', {})).status).toBe(403)
		expect(await w.sql.first('select id from account where id = ?', maker.accountId)).not.toBeNull()
	})

	test('the account page needs a session', async () => {
		const response = await call('/account')
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/')
	})
})

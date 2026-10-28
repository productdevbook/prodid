import { beforeEach, describe, expect, test } from 'bun:test'

import { OperatorClient, OperatorError } from '@prodid/batch'

import { createApp } from '../src/app'
import { caller, createSite, OPERATOR, signedIn, TOKEN, type World, world } from './selfservice'

let w: World
let call: ReturnType<typeof caller>
let operator: OperatorClient

beforeEach(async () => {
	w = world()
	call = caller(w)
	operator = new OperatorClient(`https://${OPERATOR}`, TOKEN, (request) => {
		const headers = new Headers(request.headers)
		headers.set('host', OPERATOR)
		return Promise.resolve(createApp(() => w.services).fetch(new Request(request, { headers })))
	})
	await operator.putSite('acme', { publisher: { name: 'Acme Tekstil' }, license: 'CC0-1.0' })
})

const failure = async (promise: Promise<unknown>) => {
	try {
		await promise
	} catch (error) {
		if (error instanceof OperatorError) return { status: error.status, body: error.body }
		throw error
	}
	throw new Error('the call did not fail')
}

const CLI = new URL('../../batch/src/cli.ts', import.meta.url).pathname

describe('assigning an operator-made site', () => {
	test('prodid-batch assign gives it to the account, which then lists it', async () => {
		const server = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch(request) {
				const headers = new Headers(request.headers)
				headers.set('host', OPERATOR)
				return createApp(() => w.services).fetch(new Request(request, { headers }))
			},
		})
		try {
			const child = Bun.spawn(['bun', CLI, 'assign', 'acme', 'maker@example.com'], {
				env: { PATH: process.env.PATH ?? '', PRODID_OPERATOR_URL: `http://127.0.0.1:${server.port}`, PRODID_OPERATOR_TOKEN: TOKEN },
				stdout: 'pipe',
				stderr: 'pipe',
			})
			const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
			expect(stderr).toBe('')
			expect(code).toBe(0)
			const account = await w.sql.first<{ id: string }>('select id from account where email = ?', 'maker@example.com')
			expect(JSON.parse(stdout)).toMatchObject({ site: { slug: 'acme', owner: account?.id ?? '' }, host: 'acme.prodid.org' })
		} finally {
			await server.stop(true)
		}
		const maker = await signedIn(w, 'maker@example.com')
		expect(await (await call('/sites', { headers: { cookie: maker.cookie } })).text()).toContain('href="/sites/acme"')
	})

	test('makes the account when there is none, and its owner then sees the site', async () => {
		const answer = (await operator.assign('acme', ' Maker@Example.com ')) as { site: { owner: string } }
		const account = await w.sql.first<{ id: string; email: string; last_sign_in_at: string | null }>(
			'select id, email, last_sign_in_at from account',
		)
		expect(account).toMatchObject({ email: 'maker@example.com', last_sign_in_at: null })
		expect(answer.site.owner).toBe(account?.id ?? '')
		expect(JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}').owner).toBe(account?.id ?? '')
		expect(await w.sql.all('select slug, account_id, deleted_at from site')).toEqual([
			{ slug: 'acme', account_id: account?.id ?? '', deleted_at: null },
		])

		const maker = await signedIn(w, 'maker@example.com')
		expect(maker.accountId).toBe(account?.id ?? '')
		const list = await (await call('/sites', { headers: { cookie: maker.cookie } })).text()
		expect(list).toContain('href="/sites/acme"')
		expect((await call('/sites/acme', { headers: { cookie: maker.cookie } })).status).toBe(200)
	})

	test('uses the account that already exists, and assigning again changes nothing', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		await operator.assign('acme', 'maker@example.com')
		const before = await w.blobs.text('sites/acme/site.json')
		await operator.assign('acme', 'maker@example.com')
		expect(await w.blobs.text('sites/acme/site.json')).toBe(before)
		expect(await w.sql.all('select id from account')).toEqual([{ id: maker.accountId }])
		expect(JSON.parse(before ?? '{}').owner).toBe(maker.accountId)
	})

	test('refuses a site someone else owns', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		await createSite(call, maker, 'their-shop')
		expect(await failure(operator.assign('their-shop', 'other@example.com'))).toEqual({
			status: 409,
			body: { error: 'site has another owner' },
		})
		expect(JSON.parse((await w.blobs.text('sites/their-shop/site.json')) ?? '{}').owner).toBe(maker.accountId)
	})

	test('refuses an account that already has five sites', async () => {
		const maker = await signedIn(w, 'maker@example.com')
		for (const slug of ['one-shop', 'two-shop', 'three-shop', 'four-shop', 'five-shop']) await createSite(call, maker, slug)
		expect(await failure(operator.assign('acme', 'maker@example.com'))).toEqual({
			status: 409,
			body: { error: 'maker@example.com already owns 5 sites' },
		})
		expect(JSON.parse((await w.blobs.text('sites/acme/site.json')) ?? '{}')).not.toHaveProperty('owner')
	})

	test('refuses an unknown site and a malformed email, and needs the token', async () => {
		expect((await failure(operator.assign('nobody', 'maker@example.com'))).status).toBe(404)
		expect(await failure(operator.assign('acme', 'not an email'))).toEqual({
			status: 400,
			body: { error: 'email is not an email address' },
		})
		expect(await w.sql.all('select * from account')).toEqual([])
		const response = await call('/sites/acme/owner', {
			method: 'PUT',
			headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'maker@example.com' }),
		})
		expect(response.status).toBe(401)
	})
})

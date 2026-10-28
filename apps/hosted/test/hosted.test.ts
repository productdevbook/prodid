import { beforeEach, describe, expect, test } from 'bun:test'

import { convertMerchant, OperatorClient, OperatorError } from '@prodid/batch'
import { acceptDiscovery, type TxtRecord, validateFeed } from '@prodid/core'

import { createApp, reverifyAll, type Services } from '../src/app'
import type { TxtLookup } from '../src/dns'
import type { Blobs, StoredObject } from '../src/sites'

const TOKEN = 'operator-secret'
const ZONE = 'prodid.org'
const OPERATOR = 'publish.prodid.org'
const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)

class MemoryBlobs implements Blobs {
	readonly objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; uploaded: Date; etag: string }>()
	private version = 0

	async get(key: string): Promise<StoredObject | null> {
		const object = this.objects.get(key)
		if (object === undefined) return null
		return { body: new Blob([object.bytes]).stream(), etag: object.etag, uploaded: object.uploaded, size: object.bytes.byteLength }
	}

	async text(key: string): Promise<string | null> {
		const object = this.objects.get(key)
		return object === undefined ? null : new TextDecoder().decode(object.bytes)
	}

	async put(key: string, body: ArrayBuffer | string): Promise<void> {
		const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body.slice(0))
		this.objects.set(key, {
			bytes: bytes as Uint8Array<ArrayBuffer>,
			uploaded: new Date('2026-10-01T00:00:00Z'),
			etag: `"v${++this.version}"`,
		})
	}

	async delete(keys: string[]): Promise<void> {
		for (const key of keys) this.objects.delete(key)
	}

	async slugs(): Promise<string[]> {
		const slugs = new Set<string>()
		for (const key of this.objects.keys()) slugs.add(key.split('/')[1] ?? '')
		return [...slugs]
	}
}

let blobs: MemoryBlobs
let txt: Map<string, TxtRecord[] | 'servfail'>
let pinged: string[][]
let services: Services

function call(host: string, path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers)
	headers.set('host', host)
	return Promise.resolve(createApp(() => services).fetch(new Request(`https://${host}${path}`, { ...init, headers })))
}

function client(token = TOKEN): OperatorClient {
	return new OperatorClient(`https://${OPERATOR}`, token, (request) => {
		const headers = new Headers(request.headers)
		headers.set('host', OPERATOR)
		return Promise.resolve(createApp(() => services).fetch(new Request(request, { headers })))
	})
}

async function fixtureFeed(): Promise<string> {
	const conversion = await convertMerchant(Bun.file(new URL('feed.csv', MERCHANT)).stream(), {
		lang: 'en',
		markets: ['TR'],
		license: 'CC-BY-4.0',
	})
	return conversion.ndjson
}

beforeEach(() => {
	blobs = new MemoryBlobs()
	txt = new Map()
	pinged = []
	services = {
		blobs,
		async resolveTxt(name): Promise<TxtLookup> {
			const records = txt.get(name)
			if (records === 'servfail') return { ok: false, reason: 'servfail' }
			return { ok: true, records: records ?? [] }
		},
		async ping(domains) {
			pinged.push(domains)
		},
		now: () => new Date('2026-10-28T12:00:00Z'),
		zone: ZONE,
		operatorHost: OPERATOR,
		operatorToken: TOKEN,
	}
})

describe('operator endpoint', () => {
	test('answers nobody without the token', async () => {
		expect((await call(OPERATOR, '/sites/acme')).status).toBe(401)
		await expect(client('wrong').showSite('acme')).rejects.toBeInstanceOf(OperatorError)
		services.operatorToken = undefined
		expect((await call(OPERATOR, '/sites/acme', { headers: { authorization: 'Bearer ' } })).status).toBe(401)
	})

	test('refuses reserved and malformed slugs', async () => {
		for (const slug of ['admin', 'pr0did-shop', 'xn--abc', 'A']) {
			await expect(client().putSite(slug, { publisher: { name: 'X' }, license: 'CC0-1.0' })).rejects.toMatchObject({ status: 400 })
		}
	})

	test('refuses a site the feed schema would reject, and a domain inside the hosting zone', async () => {
		await expect(client().putSite('acme', { publisher: { name: '' }, license: 'CC0-1.0' })).rejects.toMatchObject({ status: 400 })
		await expect(
			client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0', domain: 'other.prodid.org' }),
		).rejects.toMatchObject({
			status: 400,
		})
	})

	test('refuses a feed with an invalid line, naming the line, and stores nothing', async () => {
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0' })
		const feed = `${(await fixtureFeed()).split('\n')[0]}\n{"$type":"org.prodid.item"}\n`
		const refused = await client()
			.putFeed('acme', 'items.ndjson', feed)
			.catch((error: unknown) => error)
		expect(refused).toBeInstanceOf(OperatorError)
		expect((refused as OperatorError).body).toMatchObject({ problems: [{ line: 2 }] })
		expect((await call('acme.prodid.org', '/feeds/items.ndjson')).status).toBe(404)
	})

	test('refuses a feed with a repeated key', async () => {
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0' })
		const line = (await fixtureFeed()).split('\n')[0]
		await expect(client().putFeed('acme', 'items.ndjson', `${line}\n${line}\n`)).rejects.toMatchObject({ status: 400 })
	})
})

describe('a hosted site', () => {
	test('serves a document the crawler accepts and the feed it lists, and pings for a crawl', async () => {
		await client().putSite('acme', { publisher: { name: 'Acme Tekstil', contact: 'data@acme.example' }, license: 'CC-BY-4.0' })
		expect((await call('acme.prodid.org', '/.well-known/prodid.json')).status).toBe(404)

		const feed = await fixtureFeed()
		expect(await client().putFeed('acme', 'items.ndjson', feed)).toMatchObject({ items: 4 })

		const response = await call('acme.prodid.org', '/.well-known/prodid.json')
		expect(response.status).toBe(200)
		const document: unknown = await response.json()
		expect(validateFeed(document).ok).toBe(true)
		expect(document).toMatchObject({ feeds: ['https://acme.prodid.org/feeds/items.ndjson'] })
		expect(document).not.toHaveProperty('domain')

		const decision = acceptDiscovery({
			status: response.status,
			contentType: response.headers.get('content-type'),
			body: document,
			domain: 'acme.prodid.org',
			host: 'acme.prodid.org',
			delegated: false,
		})
		expect(decision.ok).toBe(true)

		const served = await call('acme.prodid.org', '/feeds/items.ndjson')
		expect(served.headers.get('content-type')).toStartWith('application/x-ndjson')
		expect(await served.text()).toBe(feed)
		expect(pinged.at(-1)).toEqual(['acme.prodid.org'])
	})

	test('answers 304 to a crawler that already has the document or the feed', async () => {
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0' })
		await client().putFeed('acme', 'items.ndjson', await fixtureFeed())

		const first = await call('acme.prodid.org', '/.well-known/prodid.json')
		const again = await call('acme.prodid.org', '/.well-known/prodid.json', {
			headers: { 'if-none-match': first.headers.get('etag') ?? '' },
		})
		expect(again.status).toBe(304)

		const feed = await call('acme.prodid.org', '/feeds/items.ndjson')
		const feedAgain = await call('acme.prodid.org', '/feeds/items.ndjson', { headers: { 'if-none-match': feed.headers.get('etag') ?? '' } })
		expect(feedAgain.status).toBe(304)
	})

	test('names its domain only once the domain delegates to it, and drops it when the delegation goes', async () => {
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0', domain: 'Acme.Example' })
		await client().putFeed('acme', 'items.ndjson', await fixtureFeed())

		expect(await client().verify('acme')).toMatchObject({ outcome: { state: 'not-delegated', reason: 'no-record' } })
		expect(await (await call('acme.prodid.org', '/.well-known/prodid.json')).json()).not.toHaveProperty('domain')

		txt.set('_prodid.acme.example', ['v=prodid0; host=elsewhere.example'])
		expect(await client().verify('acme')).toMatchObject({ outcome: { state: 'not-delegated' } })

		txt.set('_prodid.acme.example', ['v=prodid0; host=acme.prodid.org'])
		expect(await client().verify('acme')).toMatchObject({ outcome: { state: 'verified', domain: 'acme.example' } })
		const delegated = await call('acme.prodid.org', '/.well-known/prodid.json')
		const body: unknown = await delegated.json()
		expect(body).toMatchObject({ domain: 'acme.example' })
		expect(
			acceptDiscovery({
				status: delegated.status,
				contentType: delegated.headers.get('content-type'),
				body,
				domain: 'acme.example',
				host: 'acme.prodid.org',
				delegated: true,
			}).ok,
		).toBe(true)
		expect(pinged.at(-1)).toEqual(['acme.prodid.org', 'acme.example'])

		txt.set('_prodid.acme.example', 'servfail')
		expect(await reverifyAll(services)).toEqual([])
		expect(await (await call('acme.prodid.org', '/.well-known/prodid.json')).json()).toMatchObject({ domain: 'acme.example' })

		txt.delete('_prodid.acme.example')
		expect(await reverifyAll(services)).toEqual(['acme.prodid.org', 'acme.example'])
		expect(await (await call('acme.prodid.org', '/.well-known/prodid.json')).json()).not.toHaveProperty('domain')
	})

	test('a changed domain is not verified until its own record is seen', async () => {
		txt.set('_prodid.acme.example', ['v=prodid0; host=acme.prodid.org'])
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0', domain: 'acme.example' })
		await client().putFeed('acme', 'items.ndjson', await fixtureFeed())
		await client().verify('acme')
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0', domain: 'other.example' })
		expect(await (await call('acme.prodid.org', '/.well-known/prodid.json')).json()).not.toHaveProperty('domain')
	})

	test('removing the last feed or the site stops serving it', async () => {
		await client().putSite('acme', { publisher: { name: 'Acme' }, license: 'CC0-1.0' })
		await client().putFeed('acme', 'items.ndjson', await fixtureFeed())
		await client().removeFeed('acme', 'items.ndjson')
		expect((await call('acme.prodid.org', '/.well-known/prodid.json')).status).toBe(404)
		expect((await call('acme.prodid.org', '/feeds/items.ndjson')).status).toBe(404)
		await client().removeSite('acme')
		expect(blobs.objects.size).toBe(0)
	})

	test('answers the spec problem for a host or path it does not serve', async () => {
		for (const [host, path] of [
			['acme.prodid.org', '/'],
			['nobody.prodid.org', '/.well-known/prodid.json'],
			['admin.prodid.org', '/.well-known/prodid.json'],
			['acme.example', '/.well-known/prodid.json'],
			['acme.prodid.org', '/sites/acme'],
		] as const) {
			const response = await call(host, path)
			expect(response.status).toBe(404)
			expect(await response.json()).toMatchObject({ type: 'https://prodid.org/problem/not-found' })
		}
	})
})

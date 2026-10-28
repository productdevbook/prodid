import { beforeEach, describe, expect, test } from 'bun:test'

import { type Browser, caller, createSite, post, signedIn, type World, world } from './selfservice'

const MERCHANT = new URL('../../../spec/fixtures/merchant/', import.meta.url)

let w: World
let call: ReturnType<typeof caller>
let maker: Browser

beforeEach(async () => {
	w = world()
	call = caller(w)
	maker = await signedIn(w, 'maker@example.com')
	await createSite(call, maker, 'acme')
})

interface Unzipped {
	name: string
	bytes: Uint8Array
	crc: number
	flags: number
	method: number
}

/** Reads an archive the way unzip does: from the end-of-central-directory record back to each entry. */
function unzip(archive: Uint8Array): Unzipped[] {
	const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
	const end = archive.byteLength - 22
	expect(view.getUint32(end, true)).toBe(0x06054b50)
	const count = view.getUint16(end + 10, true)
	let at = view.getUint32(end + 16, true)
	expect(at + view.getUint32(end + 12, true)).toBe(end)
	const entries: Unzipped[] = []
	for (let index = 0; index < count; index++) {
		expect(view.getUint32(at, true)).toBe(0x02014b50)
		const flags = view.getUint16(at + 8, true)
		const method = view.getUint16(at + 10, true)
		const crc = view.getUint32(at + 16, true)
		const size = view.getUint32(at + 20, true)
		expect(view.getUint32(at + 24, true)).toBe(size)
		const nameLength = view.getUint16(at + 28, true)
		const extra = view.getUint16(at + 30, true)
		const comment = view.getUint16(at + 32, true)
		const local = view.getUint32(at + 42, true)
		const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength))

		expect(view.getUint32(local, true)).toBe(0x04034b50)
		const localName = view.getUint16(local + 26, true)
		const data = local + 30 + localName + view.getUint16(local + 28, true)
		const bytes = archive.slice(data, data + size)
		expect(view.getUint32(data + size, true)).toBe(0x08074b50)
		expect(view.getUint32(data + size + 4, true)).toBe(crc)
		entries.push({ name, bytes, crc, flags, method })
		at += 46 + nameLength + extra + comment
	}
	return entries
}

async function upload(name: string, file: File) {
	return post(call, maker, '/sites/acme/feeds', { file, feed: name, lang: 'en', markets: '', media: 'none' })
}

describe('export', () => {
	test('is a zip of site.json and every feed, byte for byte as stored', async () => {
		const fixture = await Bun.file(new URL('feed.ndjson', MERCHANT)).arrayBuffer()
		expect((await upload('items.ndjson', new File([fixture], 'items.ndjson'))).status).toBe(200)
		expect((await upload('more.ndjson', await merchant())).status).toBe(200)

		const response = await call('/sites/acme/export', { headers: { cookie: maker.cookie } })
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('application/zip')
		expect(response.headers.get('content-disposition')).toBe('attachment; filename="acme.prodid.org.zip"')
		expect(response.headers.get('cache-control')).toBe('no-store')

		const entries = unzip(new Uint8Array(await response.arrayBuffer()))
		expect(entries.map((entry) => entry.name)).toEqual(['site.json', 'feeds/items.ndjson', 'feeds/more.ndjson'])
		const keys = ['sites/acme/site.json', 'sites/acme/feeds/items.ndjson', 'sites/acme/feeds/more.ndjson']
		for (const [index, entry] of entries.entries()) {
			const stored = w.blobs.objects.get(keys[index] ?? '')?.bytes
			expect(stored).toBeDefined()
			expect(entry.bytes).toEqual(stored as Uint8Array)
			expect(entry.crc).toBe(Bun.hash.crc32(entry.bytes))
			expect(entry.method).toBe(0)
		}
		expect(JSON.parse(new TextDecoder().decode(entries[0]?.bytes)).feeds).toEqual(['items.ndjson', 'more.ndjson'])
	})

	test('a site with no feed exports its site.json alone', async () => {
		const entries = unzip(new Uint8Array(await (await call('/sites/acme/export', { headers: { cookie: maker.cookie } })).arrayBuffer()))
		expect(entries.map((entry) => entry.name)).toEqual(['site.json'])
		expect(entries[0]?.bytes).toEqual(w.blobs.objects.get('sites/acme/site.json')?.bytes as Uint8Array)
	})

	test('is offered on the site page', async () => {
		const html = await (await call('/sites/acme', { headers: { cookie: maker.cookie } })).text()
		expect(html).toContain('href="/sites/acme/export"')
		expect(html).toContain('Download everything')
	})

	test('answers nobody but the owner', async () => {
		const other = await signedIn(w, 'other@example.com')
		expect((await call('/sites/acme/export', { headers: { cookie: other.cookie } })).status).toBe(404)
		const signedOut = await call('/sites/acme/export')
		expect(signedOut.status).toBe(303)
		expect(signedOut.headers.get('location')).toBe('/')
	})
})

async function merchant(): Promise<File> {
	return new File([await Bun.file(new URL('feed.csv', MERCHANT)).arrayBuffer()], 'feed.csv')
}

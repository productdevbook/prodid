import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { type EntityRecord, sha256Hex, validateEntity } from '@prodid/core'
import { blockMedia } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import { consumeMedia, consumeMediaDeadLetter } from '../src/consumer'
import { POLICY } from '../src/limits/policy'
import { IMMUTABLE } from '../src/media/store'
import { document, GTINS, item, pdf, png, svg } from './support/fixtures'
import { json, startEdge } from './support/harness'

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const TEN_MINUTES = 600_001
const FEED = 'https://acme.example/items.ndjson'
const IMAGE = 'https://cdn.example/navy.png'

function serve(media: { url: string; license: string; kind?: 'image' | 'document' }[], bytes?: Uint8Array): void {
	edge!.net.document('acme.example', document({ feeds: [FEED] }))
	edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, media })])
	for (const entry of media) {
		edge!.net.serve(entry.url, { status: 200, headers: { 'content-type': 'text/plain' }, body: bytes ?? png(1) })
	}
}

async function claims(): Promise<EntityRecord['claims']> {
	const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}?history=1`))
	const valid = validateEntity(entity)
	if (!valid.ok) throw new Error(`entity is not valid: ${JSON.stringify(valid.errors)}`)
	return entity.claims.filter((claim) => claim.property === 'media')
}

describe.skipIf(!reachable)('media into R2', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a file is fetched, sniffed, stored under its digest and only then claimed', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0', kind: 'image' }])
		await edge!.crawl('acme.example')

		// The crawl finished without waiting for the file, and the claim is not there yet.
		expect(await claims()).toHaveLength(0)
		expect(edge!.mediaQueue.sent).toHaveLength(1)

		await edge!.drainMedia()
		const stored = [...edge!.media.objects.entries()]
		expect(stored).toHaveLength(1)
		const [key, object] = stored[0]!
		expect(key).toMatch(/^sha256\/[0-9a-f]{64}$/)
		// The content type is the sniffed one, not the `text/plain` the host sent.
		expect(object.options.contentType).toBe('image/png')
		expect(object.options.cacheControl).toBe(IMMUTABLE)
		expect(object.options.sourceUrl).toBe(IMAGE)

		const media = await claims()
		expect(media).toHaveLength(1)
		const value = media[0]!.value as { sha256: string; media_url: string; url: string; license: string; kind: string }
		expect(value.media_url).toBe(`https://media.prodid.org/${key}`)
		expect(value.url).toBe(IMAGE)
		expect(value.license).toBe('CC-BY-4.0')
		expect(value.kind).toBe('image')

		const rows = await edge!.sql<{ sha256: string; content_type: string; bytes: string }[]>`
			select sha256, content_type, bytes::text from media
		`
		expect(rows[0]?.content_type).toBe('image/png')
		expect(rows[0]?.sha256).toBe(value.sha256)
	})

	test('an unchanged re-crawl does not fetch the file again', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const fetched = edge!.net.fetched.filter((url) => url === IMAGE).length

		edge!.clock.advance(TEN_MINUTES)
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'unchanged' })
		await edge!.drainMedia()

		expect(edge!.net.fetched.filter((url) => url === IMAGE).length).toBe(fetched)
		expect((await claims()).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)
	})

	test('a URL the publisher removes withdraws its claim', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		expect((await claims()).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)

		edge!.clock.advance(TEN_MINUTES)
		serve([])
		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })

		const after = await claims()
		expect(after).toHaveLength(1)
		expect(after[0]?.withdrawn_at).toBeDefined()
	})

	test('identical bytes behind a new URL are claimed again but stored once', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		edge!.clock.advance(TEN_MINUTES)
		const moved = 'https://cdn.example/navy-2.png'
		serve([{ url: moved, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		expect(edge!.media.objects.size).toBe(1)
		const rows = await edge!.sql<{ count: string }[]>`select count(*)::text as count from media`
		expect(rows[0]?.count).toBe('1')

		const active = (await claims()).filter((claim) => claim.withdrawn_at === undefined)
		expect(active).toHaveLength(1)
		expect((active[0]!.value as { url: string }).url).toBe(moved)
	})

	test('changed bytes behind the same URL are a new file and a new claim', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(1))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const first = (await claims())[0]!.value as { sha256: string }

		edge!.clock.advance(TEN_MINUTES)
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(2))
		await edge!.crawl('acme.example')
		// The record is unchanged, so nothing re-enqueues the file; the next real change would.
		edge!.mediaQueue.sent.length = 0
		await edge!.mediaQueue.sendBatch([
			{
				source: '1',
				crawl: '1',
				targets: [{ recordKey: 'tj-navy-m', opid: (await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))).opid }],
				entry: { url: IMAGE, license: 'CC-BY-4.0' },
				zone: 'acme.example',
			},
		])
		await edge!.drainMedia()

		expect(edge!.media.objects.size).toBe(2)
		const all = await claims()
		const active = all.filter((claim) => claim.withdrawn_at === undefined)
		expect(active).toHaveLength(1)
		expect((active[0]!.value as { sha256: string }).sha256).not.toBe(first.sha256)
		expect(all.filter((claim) => claim.withdrawn_at !== undefined)).toHaveLength(1)
	})

	test('a blocked hash is refused and never stored again', async () => {
		const bytes = png(7)
		const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
		const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
		await blockMedia(edge!.sql, { sha256, now: edge!.clock.now() })

		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], bytes)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		expect(edge!.media.objects.size).toBe(0)
		expect(await claims()).toHaveLength(0)
	})

	test('an SVG cannot be sniffed into the store, whatever the host calls it', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] })])
		edge!.net.serve(IMAGE, { status: 200, headers: { 'content-type': 'image/png' }, body: svg() })

		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(0)
		expect(await claims()).toHaveLength(0)
	})

	test('a file that cannot be fetched fails neither the record nor the crawl', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] })])
		edge!.net.serve(IMAGE, { status: 503 })

		expect(await edge!.crawl('acme.example')).toMatchObject({ kind: 'done', outcome: 'changed' })
		await edge!.drainMedia()

		const status = await json<{ lapsed: boolean; last_crawl: { outcome: string; feeds_failed: number } }>(
			await edge!.fetch('/source/acme.example'),
		)
		expect(status.lapsed).toBe(false)
		expect(status.last_crawl.outcome).toBe('success')
		expect(status.last_crawl.feeds_failed).toBe(0)
		// The record kept everything else it said.
		const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))
		expect(entity.claims.some((claim) => claim.property === 'name')).toBe(true)
		expect(entity.claims.some((claim) => claim.property === 'media')).toBe(false)
	})

	test('a file over the cap is refused and nothing is stored', async () => {
		edge!.services.caps.imageBytes = 8
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(1))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(0)
		expect(await claims()).toHaveLength(0)
		edge!.services.caps.imageBytes = 20_971_520
	})

	test('media is fetched from a host the document does not have to own, under that host budget', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < 20; attempt += 1) await edge!.limits.hostFetch('cdn.example', false, now, `z${attempt}.example`)

		await edge!.drainMedia()
		// Held back, not failed: the message comes back when the budget does.
		expect(edge!.media.objects.size).toBe(0)
		expect(edge!.mediaQueue.pending).toHaveLength(1)

		edge!.clock.advance(60_000)
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(1)
	})
})

describe.skipIf(!reachable)('media.prodid.org', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a stored file is served with the sniffed type and a policy that makes it not a page', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0', kind: 'image' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const [key] = [...edge!.media.objects.keys()]
		const hex = key!.slice('sha256/'.length)

		const response = await edge!.fetchMedia(`/sha256/${hex}`)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('image/png')
		expect(response.headers.get('x-content-type-options')).toBe('nosniff')
		expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
		expect(response.headers.get('access-control-allow-origin')).toBe('*')
		expect(response.headers.get('cache-control')).toContain('immutable')

		const revalidated = await edge!.fetchMedia(`/sha256/${hex}`, { headers: { 'if-none-match': response.headers.get('etag')! } })
		expect(revalidated.status).toBe(304)
	})

	test('a blocked hash answers 410 with the problem type, not the bytes', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const [key] = [...edge!.media.objects.keys()]
		const hex = key!.slice('sha256/'.length)

		await blockMedia(edge!.sql, { sha256: hex, now: edge!.clock.now() })
		const response = await edge!.fetchMedia(`/sha256/${hex}`)
		expect(response.status).toBe(410)
		expect(await json<{ type: string }>(response)).toMatchObject({ type: 'https://prodid.org/problem/blocked-media' })
	})

	test('a licence the index may not redistribute is never fetched', async () => {
		serve([{ url: IMAGE, license: 'All-Rights-Reserved' }])
		await edge!.crawl('acme.example')
		const before = edge!.net.fetched.filter((url) => url === IMAGE).length
		await edge!.drainMedia()
		expect(edge!.net.fetched.filter((url) => url === IMAGE).length).toBe(before)
		expect(edge!.media.objects.size).toBe(0)
	})

	test('bytes that disagree with the declared kind are skipped', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0', kind: 'document' }], png(1))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(0)
		expect(await claims()).toHaveLength(0)
	})
})

describe.skipIf(!reachable)('media failures are counted, never reported per entry', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('a file that produces no claim raises media_failed on the crawl that found it', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(FEED, [
			item({
				key: 'tj-navy-m',
				gtin: GTINS.navy,
				media: [
					{ url: IMAGE, license: 'CC-BY-4.0' },
					{ url: 'https://cdn.example/gone.png', license: 'CC-BY-4.0' },
				],
			}),
		])
		edge!.net.serve(IMAGE, { status: 200, headers: { 'content-type': 'image/png' }, body: png(3) })
		edge!.net.serve('https://cdn.example/gone.png', { status: 404 })

		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		const status = await json<{ last_crawl: { media_failed: number } }>(await edge!.fetch('/source/acme.example'))
		expect(status.last_crawl.media_failed).toBe(1)
		// One bit per entry: the claim that could be made was made.
		expect((await claims()).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)
	})
})

describe.skipIf(!reachable)('the cap comes from what the bytes are', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('an entry that declares no kind is capped by the kind it turns out to be', async () => {
		// Below the document cap, above the image one: only reading it can tell which applies.
		edge!.services.caps.imageBytes = 32
		edge!.services.caps.documentBytes_media = 4096
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], pdf())
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		expect(edge!.media.objects.size).toBe(1)
		const [, object] = [...edge!.media.objects.entries()][0]!
		expect(object.options.contentType).toBe('application/pdf')
		// A document is downloaded, never rendered in place.
		const hex = [...edge!.media.objects.keys()][0]!.slice('sha256/'.length)
		const served = await edge!.fetchMedia(`/sha256/${hex}`)
		expect(served.headers.get('content-disposition')).toBe('attachment')
		expect(served.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")

		edge!.services.caps.imageBytes = 20_971_520
		edge!.services.caps.documentBytes_media = 52_428_800
	})

	test('the licence list is core\u2019s closed one: MIT is not a media licence', async () => {
		serve([{ url: IMAGE, license: 'MIT' }])
		await edge!.crawl('acme.example')
		const before = edge!.net.fetched.filter((url) => url === IMAGE).length
		await edge!.drainMedia()
		expect(edge!.net.fetched.filter((url) => url === IMAGE).length).toBe(before)
		expect(edge!.media.objects.size).toBe(0)
	})
})

describe.skipIf(!reachable)('one file behind many records', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	const SECOND = 'https://cdn.example/navy-2.png'

	function feed(records: { key: string; gtin: string; media: { url: string; license: string }[] }[], files: Map<string, Uint8Array>) {
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(
			FEED,
			records.map((record) => item({ key: record.key, gtin: record.gtin, media: record.media })),
		)
		for (const [url, bytes] of files) {
			edge!.net.serve(url, { status: 200, headers: { 'content-type': 'text/plain' }, body: bytes })
		}
	}

	async function mediaClaimsFor(gtin: string): Promise<{ withdrawn_at?: string; value: unknown }[]> {
		const entity = await json<EntityRecord>(await edge!.fetch(`/01/${gtin}?history=1`))
		const valid = validateEntity(entity)
		if (!valid.ok) throw new Error(`entity is not valid: ${JSON.stringify(valid.errors)}`)
		return entity.claims.filter((claim) => claim.property === 'media')
	}

	async function mediaFailed(): Promise<number> {
		const rows = await edge!.sql<{ media_failed: number }[]>`select coalesce(max(media_failed), 0) as media_failed from crawl`
		return rows[0]?.media_failed ?? 0
	}

	test('(a) two records in one feed naming the same URL each get a claim, and the file is read once', async () => {
		feed(
			[
				{ key: 'navy', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] },
				{ key: 'black', gtin: GTINS.black, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] },
			],
			new Map([[IMAGE, png(11)]]),
		)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		expect((await mediaClaimsFor(GTINS.navy)).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)
		expect((await mediaClaimsFor(GTINS.black)).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)
		expect(edge!.media.objects.size).toBe(1)
		expect(await mediaFailed()).toBe(0)
		expect(edge!.net.fetched.filter((url) => url === IMAGE)).toHaveLength(1)
	})

	test('(b) two records with different URLs and identical bytes are stored once and claimed twice', async () => {
		feed(
			[
				{ key: 'navy', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] },
				{ key: 'black', gtin: GTINS.black, media: [{ url: SECOND, license: 'CC-BY-4.0' }] },
			],
			new Map([
				[IMAGE, png(12)],
				[SECOND, png(12)],
			]),
		)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		const navy = (await mediaClaimsFor(GTINS.navy)).filter((claim) => claim.withdrawn_at === undefined)
		const black = (await mediaClaimsFor(GTINS.black)).filter((claim) => claim.withdrawn_at === undefined)
		expect(navy).toHaveLength(1)
		expect(black).toHaveLength(1)
		expect((navy[0]!.value as { sha256: string }).sha256).toBe((black[0]!.value as { sha256: string }).sha256)
		expect((navy[0]!.value as { url: string }).url).not.toBe((black[0]!.value as { url: string }).url)
		expect(edge!.media.objects.size).toBe(1)
		expect(await mediaFailed()).toBe(0)
	})

	test('(c) two sources publishing identical bytes each keep their own claim', async () => {
		feed([{ key: 'navy', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] }], new Map([[IMAGE, png(13)]]))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		edge!.clock.advance(TEN_MINUTES)
		edge!.net.document('shop.example', document({ feeds: ['https://shop.example/items.ndjson'] }))
		edge!.net.feed('https://shop.example/items.ndjson', [
			item({ key: 'navy', gtin: GTINS.navy, media: [{ url: SECOND, license: 'CC-BY-4.0' }] }),
		])
		edge!.net.serve(SECOND, { status: 200, headers: { 'content-type': 'text/plain' }, body: png(13) })
		await edge!.crawl('shop.example')
		await edge!.drainMedia()

		const all = (await mediaClaimsFor(GTINS.navy)).filter((claim) => claim.withdrawn_at === undefined)
		expect(all).toHaveLength(2)
		expect(new Set(all.map((claim) => (claim.value as { sha256: string }).sha256)).size).toBe(1)
		expect(edge!.media.objects.size).toBe(1)
		expect(await mediaFailed()).toBe(0)
	})

	test('(d) a record whose file somebody else already stored still gets its own claim', async () => {
		// Another source stores the bytes first.
		edge!.net.document('shop.example', document({ feeds: ['https://shop.example/items.ndjson'] }))
		edge!.net.feed('https://shop.example/items.ndjson', [
			item({ key: 'navy', gtin: GTINS.black, media: [{ url: SECOND, license: 'CC-BY-4.0' }] }),
		])
		edge!.net.serve(SECOND, { status: 200, headers: { 'content-type': 'text/plain' }, body: png(14) })
		await edge!.crawl('shop.example')
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(1)

		edge!.clock.advance(TEN_MINUTES)
		feed([{ key: 'navy', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] }], new Map([[IMAGE, png(14)]]))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		expect((await mediaClaimsFor(GTINS.navy)).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)
		expect(edge!.media.objects.size).toBe(1)
		expect(await mediaFailed()).toBe(0)
	})

	test('(e) the same three shapes with the media messages processed at once', async () => {
		feed(
			[
				{ key: 'navy', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] },
				{ key: 'black', gtin: GTINS.black, media: [{ url: SECOND, license: 'CC-BY-4.0' }] },
				{ key: 'olive', gtin: GTINS.olive, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] },
			],
			new Map([
				[IMAGE, png(15)],
				[SECOND, png(15)],
			]),
		)
		await edge!.crawl('acme.example')

		const due = edge!.mediaQueue.ready()
		expect(due.length).toBeGreaterThan(1)
		const { consumeMedia } = await import('../src/consumer')
		await Promise.all(due.map((message) => consumeMedia(edge!.services, message)))

		for (const gtin of [GTINS.navy, GTINS.black, GTINS.olive]) {
			expect((await mediaClaimsFor(gtin)).filter((claim) => claim.withdrawn_at === undefined)).toHaveLength(1)
		}
		expect(edge!.media.objects.size).toBe(1)
		expect(await mediaFailed()).toBe(0)
	})
})

describe.skipIf(!reachable)('one origin for media, one for documents', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	async function stored(): Promise<string> {
		serve([{ url: IMAGE, license: 'CC-BY-4.0', kind: 'image' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const [key] = [...edge!.media.objects.keys()]
		return key!.slice('sha256/'.length)
	}

	test('prodid.org/sha256/<hex> is a not-found problem even for a stored file', async () => {
		const hex = await stored()
		expect((await edge!.fetchMedia(`/sha256/${hex}`)).status).toBe(200)

		const response = await edge!.fetch(`/sha256/${hex}`)
		expect(response.status).toBe(404)
		expect(response.headers.get('content-type')).toContain('application/problem+json')
		expect(await json<{ status: number }>(response)).toMatchObject({ status: 404 })
	})

	test('media.prodid.org answers no resolver route', async () => {
		await stored()
		const entity = await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))
		expect((await edge!.fetch(`/id/${entity.opid}`)).status).toBe(200)

		for (const path of [`/id/${entity.opid}`, `/01/${GTINS.navy}`, '/source/acme.example', '/schemas/v0/org.prodid.item.json']) {
			const response = await edge!.fetchMedia(path)
			expect(response.status).toBe(404)
			expect(response.headers.get('content-type')).toContain('application/problem+json')
		}
		const queued = edge!.queue.sent.length
		const ping = await edge!.fetchMedia('/ping', { method: 'POST', body: JSON.stringify({ domains: ['acme.example'] }) })
		expect(ping.status).toBe(404)
		expect(edge!.queue.sent).toHaveLength(queued)
	})
})

describe.skipIf(!reachable)('the media budget at a host', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	test('ten fetches a minute, and the eleventh is deferred rather than failed', async () => {
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < 10; attempt += 1) {
			expect((await edge!.limits.mediaFetch('cdn.example', 1024, now)).ok).toBe(true)
		}
		const held = await edge!.limits.mediaFetch('cdn.example', 1024, now)
		expect(held.ok).toBe(false)
		expect(held.retryAfterMs).toBeGreaterThan(0)

		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(0)
		expect(edge!.mediaQueue.pending).toHaveLength(1)
		// Held back is not failed.
		const status = await json<{ last_crawl: { media_failed: number } }>(await edge!.fetch('/source/acme.example'))
		expect(status.last_crawl.media_failed).toBe(0)

		edge!.clock.advance(60_000)
		await edge!.drainMedia()
		expect(edge!.media.objects.size).toBe(1)
	})

	test('a reservation is settled with what the file weighed, not with its cap', async () => {
		const now = edge!.clock.now()
		// Two reservations at the image cap would be 40 MiB of the 200 MiB minute if never settled.
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		// The whole budget is still available bar the few bytes the file actually weighed.
		let admitted = 0
		for (let attempt = 0; attempt < 9; attempt += 1) {
			if ((await edge!.limits.mediaFetch('cdn.example', 20_971_520, now)).ok) admitted += 1
		}
		expect(admitted).toBe(9)
	})

	test('a fetch that fails settles its reservation too', async () => {
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] })])
		edge!.net.serve(IMAGE, { status: 503 })
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		// Nothing was read, so nothing of the 200 MiB minute is spent.
		const now = edge!.clock.now()
		let admitted = 0
		for (let attempt = 0; attempt < 9; attempt += 1) {
			if ((await edge!.limits.mediaFetch('cdn.example', 20_971_520, now)).ok) admitted += 1
		}
		expect(admitted).toBe(9)
	})
})

describe.skipIf(!reachable)('the thirty-day re-check', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	async function recrawl(bytes: Uint8Array): Promise<void> {
		edge!.clock.advance(TEN_MINUTES)
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], bytes)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
	}

	test('an unchanged record is left alone until the claim is thirty days old', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(1))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const fetched = () => edge!.net.fetched.filter((url) => url === IMAGE).length
		expect(fetched()).toBe(1)

		edge!.clock.advance(29 * 86_400_000)
		await recrawl(png(1))
		expect(fetched()).toBe(1)

		edge!.clock.advance(2 * 86_400_000)
		await recrawl(png(1))
		expect(fetched()).toBe(2)
	})

	test('same bytes leave the claim exactly as it was, seen_at included', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(5))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const before = (await claims())[0]!

		edge!.clock.advance(31 * 86_400_000)
		await recrawl(png(5))

		const after = await claims()
		expect(after).toHaveLength(1)
		expect(after[0]?.seen_at).toBe(before.seen_at)
		expect(after[0]?.withdrawn_at).toBeUndefined()
		// The stamp moved even though nothing was asserted anew, so it is not re-read every crawl.
		const rows = await edge!.sql<{ checked: string | null }[]>`
			select evidence->>'checked_at' as checked from claim where property = 'media' and withdrawn_at is null
		`
		expect(rows[0]?.checked).not.toBeNull()

		const fetched = edge!.net.fetched.filter((url) => url === IMAGE).length
		await recrawl(png(5))
		expect(edge!.net.fetched.filter((url) => url === IMAGE).length).toBe(fetched)
	})

	test('changed bytes are a new file and a new claim, and the old one is withdrawn', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(6))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		const first = (await claims())[0]!.value as { sha256: string }

		edge!.clock.advance(31 * 86_400_000)
		await recrawl(png(7))

		const all = await claims()
		const active = all.filter((claim) => claim.withdrawn_at === undefined)
		expect(active).toHaveLength(1)
		expect((active[0]!.value as { sha256: string }).sha256).not.toBe(first.sha256)
		expect(all.filter((claim) => claim.withdrawn_at !== undefined)).toHaveLength(1)
		expect(edge!.media.objects.size).toBe(2)
	})

	test('a re-check that cannot be done leaves the claim alone and is not counted against the publisher', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }], png(8))
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		edge!.clock.advance(31 * 86_400_000)
		edge!.net.document('acme.example', document({ feeds: [FEED] }))
		edge!.net.feed(FEED, [item({ key: 'tj-navy-m', gtin: GTINS.navy, media: [{ url: IMAGE, license: 'CC-BY-4.0' }] })])
		edge!.net.serve(IMAGE, { status: 500 })
		edge!.clock.advance(TEN_MINUTES)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()

		const active = (await claims()).filter((claim) => claim.withdrawn_at === undefined)
		expect(active).toHaveLength(1)
		const status = await json<{ last_crawl: { media_failed: number } }>(await edge!.fetch('/source/acme.example'))
		expect(status.last_crawl.media_failed).toBe(0)

		// And it is not tried again on every crawl from now on.
		const fetched = edge!.net.fetched.filter((url) => url === IMAGE).length
		edge!.clock.advance(TEN_MINUTES)
		await edge!.crawl('acme.example')
		await edge!.drainMedia()
		expect(edge!.net.fetched.filter((url) => url === IMAGE).length).toBe(fetched)
	})
})

describe.skipIf(!reachable)('media dead letters', () => {
	beforeEach(async () => {
		await edge!.reset()
		edge!.clock.advance(TEN_MINUTES)
	})

	async function logged(body: Parameters<typeof consumeMediaDeadLetter>[0]): Promise<Record<string, unknown>[]> {
		const warn = spyOn(console, 'warn').mockImplementation(() => {})
		try {
			await consumeMediaDeadLetter(body)
			return warn.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>)
		} finally {
			warn.mockRestore()
		}
	}

	async function exhaustCdn(): Promise<void> {
		const now = edge!.clock.now()
		for (let attempt = 0; attempt < 20; attempt += 1) await edge!.limits.hostFetch('cdn.example', false, now, `z${attempt}.example`)
	}

	test('a file held back past the cap goes to the media dead letter queue, not nowhere', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		const [message] = edge!.mediaQueue.ready()
		await exhaustCdn()

		await consumeMedia(edge!.services, { ...message!, deferrals: POLICY.maxDeferrals })

		expect(edge!.mediaQueue.pending).toHaveLength(0)
		expect(edge!.mediaDead.letters).toHaveLength(1)
		expect(edge!.mediaDead.letters[0]?.reason).toContain('held back')
		expect(edge!.mediaDead.letters[0]?.message).toMatchObject({
			source: message!.source,
			entry: { url: IMAGE },
			deferrals: POLICY.maxDeferrals + 1,
		})
		expect(edge!.media.objects.size).toBe(0)
	})

	test('a deferral under the cap is sent again, not dead-lettered', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		await exhaustCdn()
		await edge!.drainMedia()
		expect(edge!.mediaDead.letters).toHaveLength(0)
		expect(edge!.mediaQueue.pending).toHaveLength(1)
	})

	test('the consumer logs one media.dead-letter line with the URL by digest', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		const [message] = edge!.mediaQueue.ready()

		const reason = "held back by the crawler's own limits 13 times"
		const lines = await logged({ reason, message: { ...message!, deferrals: 13 } })
		expect(lines).toEqual([
			{ event: 'media.dead-letter', url_sha256: await sha256Hex(IMAGE), source: message!.source, reason, attempts: 13 },
		])
		expect(JSON.stringify(lines)).not.toContain(IMAGE)
	})

	test('a message the queue moved there after its retries is logged too', async () => {
		serve([{ url: IMAGE, license: 'CC-BY-4.0' }])
		await edge!.crawl('acme.example')
		const [message] = edge!.mediaQueue.ready()

		const lines = await logged(message!)
		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({ event: 'media.dead-letter', url_sha256: await sha256Hex(IMAGE), source: message!.source, attempts: 0 })
		expect(lines[0]?.reason).toContain('retry')
	})
})

import { describe, expect, test } from 'bun:test'

import { type EntityRecord, problem, type SourceRecord } from '@prodid/core'

import { renderEntity, renderProblem, renderSource } from '../src/render'
import { entityView } from '../src/view'

const SOURCE = { name: 'acme.example', trust: 'verified' as const, lapsed: false }
const OTHER = { name: 'shop.example', trust: 'unverified' as const, lapsed: true }

function entity(claims: EntityRecord['claims']): EntityRecord {
	return {
		$type: 'org.prodid.entity',
		opid: 'kq7m3v9dn2hb4t5x',
		kind: 'item',
		parents: { family: '3n7k2q9vdfhb4mta', variant: '9p2d4kv7mq3nbhxf' },
		identifiers: [
			{ scheme: 'gtin', value: '09506000134352' },
			{ scheme: 'sku', value: 'TJ-NV-M', scope: 'acme.example' },
		],
		claims,
	}
}

describe('the entity view-model', () => {
	test('names and brands come out separately, each attributed', () => {
		const view = entityView(
			entity([
				{ property: 'name', value: 'Trail Jacket', lang: 'en', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'name', value: 'Trekkingjacke', lang: 'de', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'brand', value: 'Acme', lang: 'en', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
			]),
		)
		expect(view.names.map((entry) => entry.lang)).toEqual(['en', 'de'])
		expect(view.brands).toHaveLength(1)
		expect(view.names[0]?.source).toEqual({ ...SOURCE, href: '/source/acme.example' })
		expect(view.properties).toHaveLength(0)
	})

	test('two sources disagreeing stand side by side under one property', () => {
		const view = entityView(
			entity([
				{ property: 'properties.weight', value: 480, source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'properties.weight', value: 512, source: OTHER, seen_at: '2026-09-15T09:12:03Z' },
				{ property: 'variant.color', value: 'Navy', lang: 'en', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'variant.color', value: 'Navy', lang: 'en', source: OTHER, seen_at: '2026-09-15T09:12:03Z' },
			]),
		)
		const weight = view.properties.find((property) => property.property === 'properties.weight')!
		expect(weight.key).toBe('weight')
		expect(weight.values).toHaveLength(2)
		expect(weight.disagreement).toBe(true)

		// Agreeing is not disagreeing, however many sources say it.
		const color = view.properties.find((property) => property.property === 'variant.color')!
		expect(color.disagreement).toBe(false)
		expect(view.hasLapsedSource).toBe(true)
	})

	test('media comes out as thumbnails with the licence and the source', () => {
		const value = {
			sha256: 'e'.repeat(64),
			url: 'https://acme.example/navy.webp',
			media_url: `https://media.prodid.org/sha256/${'e'.repeat(64)}`,
			license: 'CC-BY-4.0',
			kind: 'image' as const,
		}
		const view = entityView(entity([{ property: 'media', value, source: SOURCE, seen_at: '2026-09-14T09:12:03Z' }]))
		expect(view.media).toHaveLength(1)
		expect(view.media[0]?.mediaUrl).toBe(value.media_url)
		expect(view.media[0]?.sourceUrl).toBe(value.url)
		expect(view.properties.some((property) => property.property === 'media')).toBe(false)
	})

	test('navigation is opids with the links already made', () => {
		const record = entity([])
		record.children = []
		record.merged_from = ['9p2d4kv7mq3nbhxg']
		const view = entityView(record)
		expect(view.navigation.family?.href).toBe('/id/3n7k2q9vdfhb4mta')
		expect(view.navigation.mergedFrom[0]?.href).toBe('/id/9p2d4kv7mq3nbhxg')
	})
})

describe('the renderer', () => {
	test('a hostile value introduces no tag and no attribute', () => {
		const payloads = [
			'<script>alert(1)</script>',
			'"><img src=x onerror=alert(1)>',
			"';alert(1);//",
			'<svg/onload=alert(1)>',
			'</table><script>x</script>',
		]
		for (const payload of payloads) {
			const html = renderEntity(
				entity([{ property: 'name', value: payload, lang: 'en', source: { ...SOURCE, name: payload }, seen_at: '2026-09-14T09:12:03Z' }]),
			)
			for (const opener of ['<script', '<img', '<svg', '<iframe']) expect(html.toLowerCase()).not.toContain(opener)
			// Anything that could open markup comes out escaped. A payload made only of characters
			// that cannot is plain text and stays as it is, which is the correct answer for it.
			if (/[<>"&]/.test(payload)) expect(html).not.toContain(payload)
		}
	})

	test('a media entry renders as an image from media.prodid.org', () => {
		const value = {
			sha256: 'a'.repeat(64),
			url: 'https://acme.example/navy.webp',
			media_url: `https://media.prodid.org/sha256/${'a'.repeat(64)}`,
			license: 'CC-BY-4.0',
			kind: 'image' as const,
		}
		const html = renderEntity(entity([{ property: 'media', value, source: SOURCE, seen_at: '2026-09-14T09:12:03Z' }]))
		expect(html).toContain(`<img src="https://media.prodid.org/sha256/${'a'.repeat(64)}"`)
	})
})

describe('the entity page', () => {
	const file = (marker: string, kind: 'image' | 'document') => ({
		sha256: marker.repeat(64),
		url: `https://acme.example/${marker}.${kind === 'image' ? 'webp' : 'pdf'}`,
		media_url: `https://media.prodid.org/sha256/${marker.repeat(64)}`,
		license: 'CC-BY-4.0',
		kind,
	})
	const at = '2026-09-14T09:12:03Z'
	const full = (): EntityRecord => {
		const record = entity([
			{ property: 'name', value: 'Trail Jacket', lang: 'en', source: SOURCE, seen_at: at },
			{ property: 'name', value: 'Trail Jacket Navy', lang: 'en', source: OTHER, seen_at: at },
			{ property: 'media', value: file('a', 'image'), source: SOURCE, seen_at: at },
			{ property: 'media', value: file('b', 'document'), source: SOURCE, seen_at: at },
			{ property: 'brand', value: 'Acme', source: SOURCE, seen_at: at },
			{ property: 'category', value: 'Outerwear', source: SOURCE, seen_at: at },
			{ property: 'markets', value: 'TR', source: SOURCE, seen_at: at },
			{ property: 'variant.color', value: 'Navy', lang: 'en', source: SOURCE, seen_at: at },
			{ property: 'properties.weight', value: { value: 480, unit: 'g' }, source: SOURCE, seen_at: at },
			{ property: 'properties.weight', value: { value: 512, unit: 'g' }, source: OTHER, seen_at: at },
		])
		record.merged_from = ['9p2d4kv7mq3nbhxg']
		return record
	}

	test('has the sections of chapter 05, in order', () => {
		const html = renderEntity(full())
		const sections = ['header', 'media', 'facts', 'properties', 'family', 'merged', 'footer'].map((name) =>
			html.indexOf(`data-section="${name}"`),
		)
		for (const position of sections) expect(position).toBeGreaterThan(0)
		expect([...sections].sort((a, b) => a - b)).toEqual(sections)
		const headings = [
			'Images',
			'Documents',
			'Brand',
			'Identifiers',
			'Category',
			'Markets',
			'Variant',
			'Properties',
			'Part of',
			'Merged from',
		].map((title) => html.indexOf(`<h2>${title}</h2>`))
		for (const position of headings) expect(position).toBeGreaterThan(0)
		expect([...headings].sort((a, b) => a - b)).toEqual(headings)
	})

	test('the header shows every name with its source, the kind and the opid', () => {
		const header = sectionOf(renderEntity(full()), 'header')
		expect(header).toContain('Trail Jacket</span>')
		expect(header).toContain('Trail Jacket Navy</span>')
		expect(header).toContain('href="/source/shop.example"')
		expect(header).toContain('<span class="lapsed">lapsed</span>')
		expect(header).toContain('<span class="kind">item</span>')
		expect(header).toContain('kq7m3v9dn2hb4t5x</code>')
	})

	test('a chip says the source, its trust and the date, with the full time in title', () => {
		const html = renderEntity(full())
		expect(html).toContain('<span class="trust verified">verified</span>')
		expect(html).toContain(`<time datetime="${at}" title="${at}">2026-09-14</time>`)
	})

	test('images are lazy thumbnails with a size, documents are links marked PDF', () => {
		const media = sectionOf(renderEntity(full()), 'media')
		expect(media).toContain(`<img src="https://media.prodid.org/sha256/${'a'.repeat(64)}" alt="" width="160" height="160" loading="lazy"`)
		expect(media).toContain('<span class="tag">PDF</span>b.pdf')
		expect(media).toContain('CC-BY-4.0')
	})

	test('a property two sources disagree on shows both rows', () => {
		const properties = sectionOf(renderEntity(full()), 'properties')
		expect(properties).toContain('480 g')
		expect(properties).toContain('512 g')
		expect(properties).toContain('sources disagree')
		expect(properties).toContain('rowspan="2"')
	})

	test('a family links down to its children', () => {
		const record = entity([])
		record.kind = 'family'
		delete record.parents
		record.children = ['9p2d4kv7mq3nbhxf']
		const family = sectionOf(renderEntity(record), 'family')
		expect(family).toContain('<h2>Variants and items</h2>')
		expect(family).toContain('href="/id/9p2d4kv7mq3nbhxf"')
	})

	test('with history, a withdrawn claim is struck through in place with its time', () => {
		const record = entity([
			{ property: 'name', value: 'Old Jacket', lang: 'en', source: SOURCE, seen_at: at, withdrawn_at: '2026-09-20T00:00:00Z' },
		])
		const html = renderEntity(record, { history: true })
		expect(html).toContain('<del><span class="name-value" lang="en" dir="auto">Old Jacket</span></del>')
		expect(html).toContain('withdrawn <time datetime="2026-09-20T00:00:00Z"')
		expect(sectionOf(html, 'footer')).toContain('href="/id/kq7m3v9dn2hb4t5x">Current claims only')
		expect(sectionOf(renderEntity(record), 'footer')).toContain('href="/id/kq7m3v9dn2hb4t5x?history=1"')
	})

	test('the page loads nothing of its own: no stylesheet, script or font from anywhere', () => {
		const html = renderEntity(full())
		expect(html).not.toMatch(/<link\b|<script\b|@import|url\(/i)
		expect(html).toContain('<a class="wordmark" href="https://prodid.org/"')
		expect(html).toContain('@media (prefers-color-scheme:dark)')
		expect(sectionOf(html, 'footer')).toContain('Every value is a claim by its source. Choosing between them is yours.')
	})
})

describe('the source page', () => {
	const healthy = (): SourceRecord => ({
		$type: 'org.prodid.source',
		name: 'acme.example',
		kind: 'domain',
		trust: 'verified',
		verified_by: 'dns-txt',
		verified_at: '2026-09-14T09:12:03Z',
		lapsed: false,
		license: 'CC0-1.0',
		last_crawl: {
			at: '2026-09-19T06:00:11Z',
			via: 'dns-txt',
			document_url: 'https://acme.example/.well-known/prodid.json',
			outcome: 'success',
			http_status: 200,
			records_seen: 3,
			records_changed: 1,
			lines_skipped: 0,
			feeds_failed: 0,
			media_failed: 0,
		},
	})

	test('has the sections of chapter 05, in order, and no lapse banner when healthy', () => {
		const html = renderSource(healthy())
		const sections = ['header', 'verification', 'crawl', 'footer'].map((name) => html.indexOf(`data-section="${name}"`))
		for (const position of sections) expect(position).toBeGreaterThan(0)
		expect([...sections].sort((a, b) => a - b)).toEqual(sections)
		expect(sectionOf(html, 'header')).toContain('<span class="trust verified badge">verified</span>')
		expect(html).not.toContain('Lapsed since')
		expect(sectionOf(html, 'verification')).toContain('<code>dns-txt</code>')
		expect(sectionOf(html, 'verification')).toContain('<code>CC0-1.0</code>')
	})

	test('the last crawl shows every field present, the outcome with its meaning', () => {
		const crawl = sectionOf(renderSource(healthy()), 'crawl')
		for (const term of [
			'At',
			'Outcome',
			'Via',
			'Document',
			'HTTP status',
			'Records seen',
			'Records changed',
			'Lines skipped',
			'Feeds failed',
			'Media failed',
		]) {
			expect(crawl).toContain(`<dt>${term}</dt>`)
		}
		expect(crawl).toContain('<span class="outcome success">success</span>')
		expect(crawl).toContain('every feed answered 200 or 304')
		expect(crawl).toContain('https://acme.example/.well-known/prodid.json')
	})

	test('a lapsed source says since when and the withdrawal date thirty days on', () => {
		const record = healthy()
		record.lapsed = true
		record.lapsed_at = '2026-09-20T08:00:00Z'
		record.last_crawl = { at: '2026-09-20T08:00:00Z', outcome: 'definite-negative' }
		const html = renderSource(record)
		const header = sectionOf(html, 'header')
		expect(header).toContain('<span class="lapsed">lapsed</span>')
		expect(header).toContain('Lapsed since <time datetime="2026-09-20T08:00:00Z"')
		expect(header).toContain('<time datetime="2026-10-20T08:00:00Z"')
		const crawl = sectionOf(html, 'crawl')
		expect(crawl).toContain('definite-negative')
		expect(crawl).not.toContain('<dt>Document</dt>')
		expect(crawl).not.toContain('<dt>HTTP status</dt>')
	})

	test('the footer states the two rules and links the spec section', () => {
		const footer = sectionOf(renderSource(healthy()), 'footer')
		expect(footer).toContain('first successful discovery')
		expect(footer).toContain('only for the host this source was last verified at')
		expect(footer).toContain('href="https://prodid.org/spec#a-sources-status"')
	})

	test('a source with no finished crawl says so', () => {
		const record = healthy()
		delete record.last_crawl
		expect(sectionOf(renderSource(record), 'crawl')).toContain('No crawl has finished yet.')
	})
})

describe('the problem page', () => {
	test('unknown-gtin has the status, the title and where manufacturers publish', () => {
		const html = renderProblem(problem('unknown-gtin').body)
		expect(html).toContain('<title>404 No entity with that GTIN — prodid</title>')
		expect(html).toContain('Error 404')
		expect(html).toContain('<h1>No entity with that GTIN</h1>')
		expect(html).toContain(
			'No publisher has published this GTIN yet. Manufacturers publish at <a href="https://prodid.org/publish">prodid.org/publish</a>.',
		)
	})

	test('invalid-gtin has its status, title and detail, and no publishing line', () => {
		const html = renderProblem(problem('invalid-gtin', { detail: '<b>check-digit</b>' }).body)
		expect(html).toContain('Error 400')
		expect(html).toContain('<h1>Not a GTIN</h1>')
		expect(html).toContain('&lt;b&gt;check-digit&lt;/b&gt;')
		expect(html).not.toContain('No publisher has published')
	})
})

function sectionOf(html: string, name: string): string {
	const start = html.indexOf(`data-section="${name}"`)
	if (start < 0) throw new Error(`no ${name} section`)
	const end = html.indexOf('data-section="', start + 1)
	return html.slice(start, end < 0 ? undefined : end)
}

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type EntityRecord, problem, type ProblemType, type SourceRecord } from '@prodid/core'
import { mergeEntities } from '@prodid/store'
import { databaseReachable } from '@prodid/store/testing'

import {
	CATALOGUES,
	chooseLocale,
	LANGUAGES,
	type Language,
	type Locale,
	matchLanguage,
	NATIVE_NAMES,
	negotiateLanguage,
} from '../src/i18n'
import { renderEntity, renderProblem, renderSource } from '../src/render'
import { document, GTINS, JACKET } from './support/fixtures'
import { json, startEdge } from './support/harness'

const AT = '2026-09-14T09:12:03Z'
const SOURCE = { name: 'acme.example', trust: 'verified' as const, lapsed: false }
const OTHER = { name: 'shop.example', trust: 'unverified' as const, lapsed: true }
const OFFICIAL = { name: 'gs1.example', trust: 'authoritative' as const, lapsed: false }
const MARK = '\u0001'

function locale(lang: Language, fromQuery = false, search = ''): Locale {
	return { lang, fromQuery, search }
}

function request(path: string, headers: Record<string, string> = {}): Request {
	return new Request(`https://prodid.org${path}`, { headers })
}

describe('choosing the language', () => {
	test('a tag maps to its catalogue by exact match, then by primary subtag', () => {
		expect(matchLanguage('ja')).toBe('ja')
		expect(matchLanguage('zh')).toBe('zh-Hans')
		expect(matchLanguage('zh-CN')).toBe('zh-Hans')
		expect(matchLanguage('ZH-hans')).toBe('zh-Hans')
		expect(matchLanguage('zh-Hans-CN')).toBe('zh-Hans')
		expect(matchLanguage('pt')).toBe('pt-BR')
		expect(matchLanguage('pt-PT')).toBe('pt-BR')
		expect(matchLanguage('pt-br')).toBe('pt-BR')
		expect(matchLanguage('de-AT')).toBe('de')
		expect(matchLanguage('en-GB')).toBe('en')
		expect(matchLanguage('nl')).toBeNull()
		expect(matchLanguage('')).toBeNull()
		expect(matchLanguage('ja"><script>')).toBeNull()
		expect(matchLanguage('__proto__')).toBeNull()
	})

	test('Accept-Language is ranked by q, ties keep the header order, q=0 is a refusal', () => {
		expect(negotiateLanguage('nl, ja;q=0.5, de;q=0.9')).toBe('de')
		expect(negotiateLanguage('fr;q=0.8, es;q=0.8')).toBe('fr')
		expect(negotiateLanguage('ja;q=0, tr;q=0.1')).toBe('tr')
		expect(negotiateLanguage('nl-BE, fr-BE;q=0.9, en;q=0.8')).toBe('fr')
		expect(negotiateLanguage('pt-PT,pt;q=0.9')).toBe('pt-BR')
		expect(negotiateLanguage('zh-TW')).toBe('zh-Hans')
		expect(negotiateLanguage('ar-EG;q=0.7, *;q=0.9')).toBe('ar')
		expect(negotiateLanguage('ja;q=abc, de;q=0.2')).toBe('de')
		expect(negotiateLanguage('nl, sv')).toBeNull()
		expect(negotiateLanguage('')).toBeNull()
		expect(negotiateLanguage(null)).toBeNull()
	})

	test('?lang= wins when it names one of the ten, else the header, else English', () => {
		expect(chooseLocale(request('/id/x?lang=ar', { 'accept-language': 'ja' }))).toEqual({
			lang: 'ar',
			fromQuery: true,
			search: '?lang=ar',
		})
		expect(chooseLocale(request('/id/x?lang=zh-CN')).lang).toBe('zh-Hans')
		expect(chooseLocale(request('/id/x?lang=nl', { 'accept-language': 'ja' }))).toEqual({
			lang: 'ja',
			fromQuery: false,
			search: '?lang=nl',
		})
		expect(chooseLocale(request('/id/x', { 'accept-language': 'sv' })).lang).toBe('en')
		expect(chooseLocale(request('/id/x')).lang).toBe('en')
	})
})

function leaves(value: unknown, path = ''): { path: string; pieces: string[] }[] {
	if (typeof value === 'string') return [{ path, pieces: [value] }]
	if (typeof value === 'function') return [{ path, pieces: (value as (marker: string) => string)(MARK).split(MARK) }]
	return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => leaves(inner, path === '' ? key : `${path}.${key}`))
}

function entity(claims: EntityRecord['claims'], kind: EntityRecord['kind'] = 'item'): EntityRecord {
	return {
		$type: 'org.prodid.entity',
		opid: 'kq7m3v9dn2hb4t5x',
		kind,
		parents: { family: '3n7k2q9vdfhb4mta', variant: '9p2d4kv7mq3nbhxf' },
		identifiers: [
			{ scheme: 'gtin', value: '09506000134352' },
			{ scheme: 'sku', value: 'TJ-NV-M', scope: 'acme.example' },
		],
		claims,
	}
}

function full(kind: EntityRecord['kind']): EntityRecord {
	const file = (marker: string, type: 'image' | 'document') => ({
		sha256: marker.repeat(64),
		url: `https://acme.example/${marker}.${type === 'image' ? 'webp' : 'pdf'}`,
		media_url: `https://media.prodid.org/sha256/${marker.repeat(64)}`,
		license: 'CC-BY-4.0',
		kind: type,
	})
	const record = entity(
		[
			{ property: 'name', value: 'Trail Jacket', lang: 'en', source: SOURCE, seen_at: AT },
			{ property: 'name', value: 'Old Jacket', lang: 'en', source: OFFICIAL, seen_at: AT, withdrawn_at: '2026-09-20T00:00:00Z' },
			{ property: 'name', value: 'Trail Jacket Navy', lang: 'en', source: OTHER, seen_at: AT },
			{ property: 'media', value: file('a', 'image'), source: SOURCE, seen_at: AT },
			{ property: 'media', value: file('b', 'document'), source: SOURCE, seen_at: AT },
			{ property: 'brand', value: 'Acme', source: SOURCE, seen_at: AT },
			{ property: 'category', value: 'Outerwear', source: SOURCE, seen_at: AT },
			{ property: 'markets', value: 'TR', source: SOURCE, seen_at: AT },
			{ property: 'variant.color', value: 'Navy', lang: 'en', source: SOURCE, seen_at: AT },
			{ property: 'properties.weight', value: { value: 480, unit: 'g' }, source: SOURCE, seen_at: AT },
			{ property: 'properties.weight', value: { value: 512, unit: 'g' }, source: OTHER, seen_at: AT },
		],
		kind,
	)
	record.children = ['9p2d4kv7mq3nbhxg']
	record.merged_from = ['9p2d4kv7mq3nbhxh']
	return record
}

function source(kind: SourceRecord['kind'], outcome: 'success' | 'definite-negative' | 'transport-failure'): SourceRecord {
	return {
		$type: 'org.prodid.source',
		name: 'acme.example',
		kind,
		trust: 'verified',
		verified_by: 'dns-txt',
		verified_at: AT,
		lapsed: false,
		license: 'CC0-1.0',
		last_crawl: {
			at: AT,
			via: 'dns-txt',
			document_url: 'https://acme.example/.well-known/prodid.json',
			outcome,
			http_status: 200,
			records_seen: 3,
			records_changed: 1,
			lines_skipped: 0,
			feeds_failed: 0,
			media_failed: 0,
		},
	}
}

const PROBLEMS: Exclude<ProblemType, 'rate-limited'>[] = [
	'unknown-opid',
	'unknown-gtin',
	'restricted-gtin',
	'unknown-source',
	'not-found',
	'invalid-gtin',
	'invalid-request',
	'blocked-media',
]

/** Every page and every state of it that shows a string of the catalogue. */
function everyPage(lang: Language): string[] {
	const at = locale(lang)
	const lapsed = source('community', 'definite-negative')
	lapsed.lapsed = true
	lapsed.lapsed_at = AT
	const bare = source('domain', 'success')
	bare.trust = 'unverified'
	delete bare.verified_by
	delete bare.verified_at
	delete bare.license
	delete bare.last_crawl
	return [
		...(['family', 'variant', 'item'] as const).flatMap((kind) => [
			renderEntity(full(kind), { locale: at }),
			renderEntity(full(kind), { history: true, locale: at }),
		]),
		renderSource(source('hosted', 'success'), at),
		renderSource(source('dataset', 'transport-failure'), at),
		renderSource(lapsed, at),
		renderSource(bare, at),
		...PROBLEMS.map((type) => renderProblem(problem(type, { detail: 'check-digit' }).body, at)),
		renderProblem(problem('rate-limited', { retryAfterSeconds: 30 }).body, at),
	]
}

describe('the catalogues', () => {
	test('their text carries no markup of its own, so it needs no escaping to be shown', () => {
		for (const language of LANGUAGES) {
			for (const leaf of leaves(CATALOGUES[language])) {
				for (const piece of leaf.pieces) expect(`${language} ${leaf.path}: ${piece}`).not.toMatch(/[<>&"]/)
			}
		}
	})

	test('the English problem titles are the spec table’s', () => {
		for (const type of [...PROBLEMS, 'rate-limited' as const]) {
			expect(CATALOGUES.en.problem.titles[type]).toBe(problem(type, { retryAfterSeconds: 1 }).body.title)
		}
	})

	for (const language of LANGUAGES) {
		test(`${language}: every page shows every string of its catalogue, and no English one in its place`, () => {
			const html = everyPage(language).join('\n')
			const own = leaves(CATALOGUES[language])
			for (const leaf of own) {
				for (const piece of leaf.pieces.map((part) => part.trim()).filter((part) => part !== '')) {
					expect(html.includes(piece) ? '' : `${leaf.path} is not shown: ${piece}`).toBe('')
				}
			}
			if (language === 'en') return
			const english = new Map(leaves(CATALOGUES.en).map((leaf) => [leaf.path, leaf.pieces]))
			for (const leaf of own) {
				if (leaf.path.startsWith('trust.') || leaf.path === 'lapsed') continue
				const theirs = english.get(leaf.path)!
				for (const [index, piece] of theirs.entries()) {
					const written = piece.trim()
					if (written === '' || written === leaf.pieces[index]?.trim()) continue
					const leaked =
						html.includes(`>${written}<`) ||
						html.includes(`title="${written}"`) ||
						html.includes(`label="${written}"`) ||
						(written.length >= 12 && html.includes(written))
					expect(leaked ? `${leaf.path} leaks English: ${written}` : '').toBe('')
				}
			}
		})
	}

	test('a trust word is shown translated, and the protocol word stays in the class and the title', () => {
		const html = renderEntity(full('item'), { locale: locale('de') })
		expect(html).toContain('<span class="trust verified" title="verified">verifiziert</span>')
		expect(html).toContain('<span class="trust unverified" title="unverified">nicht verifiziert</span>')
		expect(html).toContain('<span class="lapsed" title="lapsed">abgelaufen</span>')
		const source = renderSource(sourceRecord(), locale('de'))
		expect(source).toContain('<span class="trust verified badge" title="verified">verifiziert</span>')
		expect(source).toContain('<span class="outcome success">success</span>')
	})
})

function sourceRecord(): SourceRecord {
	return source('domain', 'success')
}

describe('the page in its language', () => {
	test('<html lang> names the language, and only Arabic is right to left', () => {
		for (const language of LANGUAGES) {
			for (const html of [
				renderEntity(full('item'), { locale: locale(language) }),
				renderSource(sourceRecord(), locale(language)),
				renderProblem(problem('unknown-gtin').body, locale(language)),
			]) {
				expect(html).toContain(language === 'ar' ? `<html lang="ar" dir="rtl">` : `<html lang="${language}">`)
			}
		}
	})

	test('the footer lists every language in its own name, keeps the query, and marks the current one', () => {
		const html = renderEntity(full('item'), { history: true, locale: locale('ja', true, '?history=1&lang=ja') })
		const nav = html.slice(html.indexOf('<nav class="langs"'), html.indexOf('</nav>'))
		expect(nav).toContain('aria-label="言語"')
		expect(nav.match(/<a /g)).toHaveLength(LANGUAGES.length)
		for (const language of LANGUAGES) {
			expect(nav).toContain(`href="?history=1&amp;lang=${language}" hreflang="${language}" lang="${language}"`)
			expect(nav).toContain(`>${NATIVE_NAMES[language]}</a>`)
		}
		expect(nav).toContain('lang="ja" aria-current="true">日本語</a>')
		expect(nav.match(/aria-current/g)).toHaveLength(1)
	})

	test('a language picked by hand follows the reader through the page’s own links', () => {
		const picked = renderEntity(full('item'), { locale: locale('tr', true, '?lang=tr') })
		expect(picked).toContain('href="/source/acme.example?lang=tr"')
		expect(picked).toContain('href="/id/3n7k2q9vdfhb4mta?lang=tr"')
		expect(picked).toContain('href="/id/kq7m3v9dn2hb4t5x?history=1&amp;lang=tr"')
		const negotiated = renderEntity(full('item'), { locale: locale('tr') })
		expect(negotiated).toContain('href="/source/acme.example"')
		expect(negotiated).toContain('href="/id/kq7m3v9dn2hb4t5x?history=1"')
	})

	test('claim values are never translated', () => {
		for (const language of LANGUAGES) {
			const html = renderEntity(full('item'), { locale: locale(language) })
			for (const value of ['Trail Jacket Navy', 'Acme', 'Outerwear', '480 g', 'CC-BY-4.0', 'TJ-NV-M']) expect(html).toContain(value)
		}
	})

	test('where claims of one property differ by lang, the page’s language comes first and the rest keep their order', () => {
		const record = entity([
			{ property: 'name', value: 'Trail Jacket', lang: 'en', source: SOURCE, seen_at: AT },
			{ property: 'name', value: 'Trekkingjacke', lang: 'de', source: SOURCE, seen_at: AT },
			{ property: 'name', value: 'トレイルジャケット', lang: 'ja', source: OTHER, seen_at: AT },
			{ property: 'name', value: 'Jaqueta', lang: 'pt-PT', source: OTHER, seen_at: AT },
			{ property: 'variant.color', value: 'Navy', lang: 'en', source: SOURCE, seen_at: AT },
			{ property: 'variant.color', value: '紺', lang: 'ja', source: OTHER, seen_at: AT },
			{ property: 'properties.weight', value: 480, source: SOURCE, seen_at: AT },
		])
		const order = (html: string, values: string[]) => values.map((value) => html.indexOf(`>${value}</span>`))
		const sorted = (positions: number[]) => {
			for (const position of positions) expect(position).toBeGreaterThan(0)
			expect([...positions].sort((a, b) => a - b)).toEqual(positions)
		}

		const ja = renderEntity(record, { locale: locale('ja') })
		sorted(order(ja, ['トレイルジャケット', 'Trail Jacket', 'Trekkingjacke', 'Jaqueta']))
		sorted(order(ja, ['紺', 'Navy']))
		expect(ja).toContain('<title>トレイルジャケット — prodid</title>')

		const en = renderEntity(record, { locale: locale('en') })
		sorted(order(en, ['Trail Jacket', 'Trekkingjacke', 'トレイルジャケット', 'Jaqueta']))
		sorted(order(en, ['Navy', '紺']))

		sorted(order(renderEntity(record, { locale: locale('pt-BR') }), ['Jaqueta', 'Trail Jacket', 'Trekkingjacke', 'トレイルジャケット']))
		sorted(order(renderEntity(record, { locale: locale('fr') }), ['Trail Jacket', 'Trekkingjacke', 'トレイルジャケット', 'Jaqueta']))
	})
})

const reachable = await databaseReachable()
const edge = reachable ? await startEdge() : null
afterAll(async () => {
	await edge?.stop()
})

const HTML = 'text/html,application/xhtml+xml,*/*;q=0.8'

describe.skipIf(!reachable)('the language over HTTP', () => {
	let navy = ''
	let black = ''

	beforeAll(async () => {
		edge!.net.document('acme.example', document({ feeds: ['https://acme.example/items.ndjson'] }))
		edge!.net.feed('https://acme.example/items.ndjson', [JACKET.navy, JACKET.black])
		await edge!.crawl('acme.example')
		navy = (await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.navy}`))).opid
		black = (await json<EntityRecord>(await edge!.fetch(`/01/${GTINS.black}`))).opid
	})

	test('Accept-Language chooses the page, and the answer says it varies by that header', async () => {
		const response = await edge!.fetch(`/id/${navy}`, { headers: { accept: HTML, 'accept-language': 'nl;q=1, ja;q=0.9, en;q=0.5' } })
		expect(response.headers.get('content-language')).toBe('ja')
		expect(response.headers.get('vary')).toBe('Accept, Accept-Language')
		const html = await response.text()
		expect(html).toContain('<html lang="ja">')
		expect(html).toContain('<h2>識別子</h2>')
	})

	test('?lang= wins over the header, and then the URL alone decides the answer', async () => {
		const response = await edge!.fetch(`/id/${navy}?lang=ar`, { headers: { accept: HTML, 'accept-language': 'ja' } })
		expect(response.headers.get('content-language')).toBe('ar')
		expect(response.headers.get('vary')).toBe('Accept')
		expect(await response.text()).toContain('<html lang="ar" dir="rtl">')
	})

	test('English by default still varies by the header, so no cache serves it to a reader of another language', async () => {
		const response = await edge!.fetch(`/id/${navy}`, { headers: { accept: HTML } })
		expect(response.headers.get('content-language')).toBe('en')
		expect(response.headers.get('vary')).toBe('Accept, Accept-Language')
	})

	test('each language has its own validator: a page in one never revalidates a page in another', async () => {
		const en = await edge!.fetch(`/id/${navy}`, { headers: { accept: HTML, 'accept-language': 'en' } })
		const de = await edge!.fetch(`/id/${navy}`, { headers: { accept: HTML, 'accept-language': 'de' } })
		expect(en.headers.get('etag')).not.toBe(de.headers.get('etag'))
		const cross = await edge!.fetch(`/id/${navy}`, {
			headers: { accept: HTML, 'accept-language': 'de', 'if-none-match': en.headers.get('etag')! },
		})
		expect(cross.status).toBe(200)
		expect(cross.headers.get('content-language')).toBe('de')
		const same = await edge!.fetch(`/id/${navy}`, {
			headers: { accept: HTML, 'accept-language': 'de', 'if-none-match': de.headers.get('etag')! },
		})
		expect(same.status).toBe(304)
	})

	test('the JSON answer is the same whatever language is asked for', async () => {
		for (const path of [`/id/${navy}`, `/01/${GTINS.navy}`, '/source/acme.example', '/id/0000000000000000']) {
			const plain = await edge!.fetch(path, { headers: { accept: 'application/json' } })
			const asked = await edge!.fetch(`${path}?lang=ar`, { headers: { accept: 'application/json', 'accept-language': 'ja' } })
			expect(await asked.text()).toBe(await plain.text())
			expect([...asked.headers.entries()]).toEqual([...plain.headers.entries()])
			expect(asked.headers.get('content-language')).toBeNull()
			expect(asked.headers.get('vary')).toBe('Accept')
		}
	})

	test('the source page and a problem page speak the language too', async () => {
		const status = await edge!.fetch('/source/acme.example', { headers: { accept: HTML, 'accept-language': 'tr' } })
		expect(status.headers.get('content-language')).toBe('tr')
		expect(await status.text()).toContain('<h2>Son tarama</h2>')

		const missing = await edge!.fetch(`/01/${GTINS.other}?lang=de`, { headers: { accept: HTML } })
		expect(missing.status).toBe(404)
		expect(missing.headers.get('content-language')).toBe('de')
		expect(missing.headers.get('vary')).toBe('Accept')
		const page = await missing.text()
		expect(page).toContain('<h1>Keine Entität mit dieser GTIN</h1>')
		expect(page).toContain('<code>unknown-gtin</code>')
	})

	test('the 308 of a merged opid keeps a language picked by hand', async () => {
		await mergeEntities(edge!.sql, { from: black, into: navy, reason: 'test', decidedBy: 'test', now: edge!.clock.now() })
		const picked = await edge!.fetch(`/id/${black}?history=1&lang=ja`, { headers: { accept: HTML } })
		expect(picked.status).toBe(308)
		expect(picked.headers.get('location')).toBe(`/id/${navy}?history=1&lang=ja`)
		const plain = await edge!.fetch(`/id/${black}?lang=nl`, { headers: { accept: HTML } })
		expect(plain.headers.get('location')).toBe(`/id/${navy}`)
	})
})

import { describe, expect, test } from 'bun:test'

import {
	acceptDiscovery,
	checkFetchable,
	type DiscoveryResponse,
	delegationHost,
	isDnsName,
	isFeedAllowed,
	isRedirectAllowed,
	normalizeDomain,
	parseDiscoveryTxt,
	planDiscovery,
	txtName,
	type TxtRecord,
	wellKnownUrl,
} from '../src/discovery'
import type { FeedRecord } from '../src/record/types'

const DELEGATION = 'https://acme.prodid.org/.well-known/prodid.json'
const TXT = `v=prodid0; feed=${DELEGATION}`
const TXT_VECTORS = new URL('../../../spec/fixtures/txt/', import.meta.url)

interface TxtVector {
	name: string
	value: string[]
	valid: boolean
	feed?: string
}

async function txtVectors(): Promise<TxtVector[]> {
	const vectors: TxtVector[] = []
	for await (const name of new Bun.Glob('*.json').scan({ cwd: TXT_VECTORS.pathname })) {
		vectors.push({ name, ...((await Bun.file(new URL(name, TXT_VECTORS)).json()) as Omit<TxtVector, 'name'>) })
	}
	return vectors.sort((a, b) => a.name.localeCompare(b.name))
}

const DIRECT: FeedRecord = {
	$type: 'org.prodid.feed',
	version: 0,
	publisher: { name: 'Acme Tekstil' },
	license: 'CC0-1.0',
	feeds: ['https://acme.example/prodid/items.ndjson'],
}

const DELEGATED: FeedRecord = {
	$type: 'org.prodid.feed',
	version: 0,
	domain: 'acme.example',
	publisher: { name: 'Acme Tekstil' },
	license: 'CC0-1.0',
	feeds: ['https://acme.prodid.org/feeds/items.ndjson'],
}

function response(over: Partial<DiscoveryResponse> = {}): DiscoveryResponse {
	return {
		domain: 'acme.example',
		host: 'acme.example',
		delegated: false,
		status: 200,
		contentType: 'application/json',
		body: DIRECT,
		...over,
	}
}

describe('isDnsName and normalizeDomain', () => {
	test('accept a real domain and lowercase and punycode it', () => {
		expect(normalizeDomain('ACME.Example')).toBe('acme.example')
		expect(normalizeDomain(' acme.example. ')).toBe('acme.example')
		expect(normalizeDomain('köşe.example')).toBe('xn--ke-fka43b.example')
	})

	test('refuse a single label, an IP literal and anything that is not a bare name', () => {
		for (const value of ['', 'acme', 'localhost', '127.0.0.1', '10.0.0.1', '[::1]', '::1', '2130706433']) {
			expect(normalizeDomain(value)).toBeNull()
		}
		for (const value of ['acme.example/path', 'https://acme.example', 'acme.example:443', 'ac me.example', 'a@acme.example']) {
			expect(normalizeDomain(value)).toBeNull()
		}
	})

	test('isDnsName refuses what the crawler must never resolve', () => {
		expect(isDnsName('acme.example')).toBe(true)
		expect(isDnsName('xn--ke-fka43b.example')).toBe(true)
		expect(isDnsName('localhost')).toBe(false)
		expect(isDnsName('169.254.169.254')).toBe(false)
		expect(isDnsName('[::1]')).toBe(false)
		expect(isDnsName('ACME.example')).toBe(false)
	})
})

describe('wellKnownUrl and txtName', () => {
	test('build the discovery locations for a domain', () => {
		expect(wellKnownUrl('Acme.Example')).toBe('https://acme.example/.well-known/prodid.json')
		expect(txtName('Acme.Example')).toBe('_prodid.acme.example')
	})

	test('return null for a domain that cannot be used', () => {
		expect(wellKnownUrl('not a domain')).toBeNull()
		expect(txtName('127.0.0.1')).toBeNull()
	})
})

describe('checkFetchable', () => {
	test('accepts https on the default port with a DNS name', () => {
		expect(checkFetchable('https://acme.example/feeds/items.ndjson')).toEqual({ ok: true, host: 'acme.example' })
		expect(checkFetchable('https://acme.example:443/x')).toEqual({ ok: true, host: 'acme.example' })
	})

	test('refuses every other way of naming a target', () => {
		expect(checkFetchable('http://acme.example/x')).toEqual({ ok: false, reason: 'not-https' })
		expect(checkFetchable('https://acme.example:8443/x')).toEqual({ ok: false, reason: 'not-default-port' })
		expect(checkFetchable('https://user:pw@acme.example/x')).toEqual({ ok: false, reason: 'has-credentials' })
		expect(checkFetchable('https://127.0.0.1/x')).toEqual({ ok: false, reason: 'not-a-dns-name' })
		expect(checkFetchable('https://[::1]/x')).toEqual({ ok: false, reason: 'not-a-dns-name' })
		expect(checkFetchable('https://169.254.169.254/latest/meta-data/')).toEqual({ ok: false, reason: 'not-a-dns-name' })
		expect(checkFetchable('https://localhost/x')).toEqual({ ok: false, reason: 'not-a-dns-name' })
		expect(checkFetchable('/x')).toEqual({ ok: false, reason: 'not-a-url' })
		expect(checkFetchable('file:///etc/passwd')).toEqual({ ok: false, reason: 'not-https' })
	})
})

describe('isRedirectAllowed', () => {
	test('allows staying put and adding www', () => {
		expect(isRedirectAllowed('https://acme.example/a', 'https://acme.example/b')).toBe(true)
		expect(isRedirectAllowed('https://acme.example/a', 'https://www.acme.example/a')).toBe(true)
	})

	test('refuses leaving the host', () => {
		expect(isRedirectAllowed('https://acme.example/a', 'https://evil.example/a')).toBe(false)
		expect(isRedirectAllowed('https://www.acme.example/a', 'https://acme.example/a')).toBe(false)
		expect(isRedirectAllowed('https://acme.example/a', 'https://acme.example.evil.example/a')).toBe(false)
		expect(isRedirectAllowed('https://acme.example/a', 'http://acme.example/a')).toBe(false)
		expect(isRedirectAllowed('https://acme.example/a', 'https://169.254.169.254/a')).toBe(false)
	})
})

describe('delegationHost', () => {
	test('accepts exactly the one URL a delegation may name', () => {
		expect(delegationHost(DELEGATION)).toBe('acme.prodid.org')
	})

	test('refuses a port, userinfo, a query, a fragment, another path or an IP host', () => {
		for (const value of [
			'https://acme.prodid.org:8443/.well-known/prodid.json',
			'https://acme.prodid.org:443/.well-known/prodid.json',
			'https://user@acme.prodid.org/.well-known/prodid.json',
			'https://acme.prodid.org/.well-known/prodid.json?x=1',
			'https://acme.prodid.org/.well-known/prodid.json#x',
			'https://acme.prodid.org/feeds/prodid.json',
			'https://acme.prodid.org/',
			'https://169.254.169.254/.well-known/prodid.json',
			'https://[::1]/.well-known/prodid.json',
			'https://localhost/.well-known/prodid.json',
			'http://acme.prodid.org/.well-known/prodid.json',
			'https://ACME.prodid.org/.well-known/prodid.json',
			'https://acme.prodid.org./.well-known/prodid.json',
			'https://acme.prodid.org/.well-known/../.well-known/prodid.json',
		]) {
			expect(delegationHost(value)).toBeNull()
		}
	})
})

describe('parseDiscoveryTxt', () => {
	test('reads the documented form', () => {
		expect(parseDiscoveryTxt(TXT)).toEqual({ ok: true, version: 'prodid0', feed: DELEGATION, host: 'acme.prodid.org' })
	})

	test('tolerates whitespace around the separators and ignores unknown tags', () => {
		expect(parseDiscoveryTxt(`  v = prodid0 ;  feed = ${DELEGATION}  ;  note=hello ; `)).toEqual({
			ok: true,
			version: 'prodid0',
			feed: DELEGATION,
			host: 'acme.prodid.org',
		})
	})

	test('refuses an empty tag and a repeated tag', () => {
		expect(parseDiscoveryTxt(`v=prodid0;; feed=${DELEGATION}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; feed=${DELEGATION}; feed=https://evil.example/.well-known/prodid.json`)).toEqual({
			ok: false,
			reason: 'malformed',
		})
		expect(parseDiscoveryTxt('v=prodid0; hello')).toEqual({ ok: false, reason: 'malformed' })
	})

	test('refuses a tag the grammar does not allow, rather than ignoring it', () => {
		expect(parseDiscoveryTxt(`v=prodid0; Feed=${DELEGATION}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; 1st=x; feed=${DELEGATION}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; note=two words; feed=${DELEGATION}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt('v=prodid0 extra')).toEqual({ ok: false, reason: 'malformed' })
	})

	test('refuses a record longer than the spec allows', () => {
		const padding = 'x'.repeat(512)
		expect(parseDiscoveryTxt(`v=prodid0; feed=${DELEGATION}; note=${padding}`)).toEqual({ ok: false, reason: 'malformed' })
	})

	test('concatenates the character strings of one record with nothing between them', () => {
		expect(parseDiscoveryTxt(['v=prodid0; feed=https://acme.prodid.org', '/.well-known/prodid.json'])).toEqual({
			ok: true,
			version: 'prodid0',
			feed: DELEGATION,
			host: 'acme.prodid.org',
		})
		expect(parseDiscoveryTxt('"v=prodid0; feed=https://acme.prodid.org" "/.well-known/prodid.json"')).toEqual({
			ok: true,
			version: 'prodid0',
			feed: DELEGATION,
			host: 'acme.prodid.org',
		})
	})

	test('is not a prodid record unless v=prodid0 comes first', () => {
		expect(parseDiscoveryTxt(`feed=${DELEGATION}; v=prodid0`)).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt(`v=prodid1; feed=${DELEGATION}`)).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt(`V=PRODID0; feed=${DELEGATION}`)).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt('v=spf1 include:example.com ~all')).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt('')).toEqual({ ok: false, reason: 'not-prodid' })
	})

	test('agrees with every conformance vector the spec ships', async () => {
		const vectors = await txtVectors()
		expect(vectors.length).toBeGreaterThan(0)
		for (const { name, value, valid, feed } of vectors) {
			const result = parseDiscoveryTxt(value)
			if (result.ok !== valid) throw new Error(`fixtures/txt/${name}: expected valid=${valid}, got ${JSON.stringify(result)}`)
			if (result.ok && result.feed !== feed) throw new Error(`fixtures/txt/${name}: expected feed ${feed}, got ${result.feed}`)
		}
	})

	test('is a broken prodid record when the feed is missing or malformed', () => {
		expect(parseDiscoveryTxt('v=prodid0')).toEqual({ ok: false, reason: 'missing-feed' })
		expect(parseDiscoveryTxt('v=prodid0; note=hello')).toEqual({ ok: false, reason: 'missing-feed' })
		for (const feed of [
			'http://acme.prodid.org/.well-known/prodid.json',
			'https://acme.prodid.org:8443/.well-known/prodid.json',
			'https://user@acme.prodid.org/.well-known/prodid.json',
			'https://acme.prodid.org/evil.json',
			'https://169.254.169.254/.well-known/prodid.json',
		]) {
			expect(parseDiscoveryTxt(`v=prodid0; feed=${feed}`)).toEqual({ ok: false, reason: 'bad-feed-url' })
		}
	})
})

describe('planDiscovery', () => {
	test('falls back to the well-known URL when there is no prodid record', () => {
		const other: TxtRecord[] = ['v=spf1 include:example.com ~all', ['google-site-verification=abc']]
		expect(planDiscovery('Acme.Example', other)).toEqual({
			ok: true,
			plan: { via: 'well-known', documentUrl: 'https://acme.example/.well-known/prodid.json', host: 'acme.example', delegated: false },
		})
		expect(planDiscovery('acme.example', [])).toEqual({
			ok: true,
			plan: { via: 'well-known', documentUrl: 'https://acme.example/.well-known/prodid.json', host: 'acme.example', delegated: false },
		})
	})

	test('follows a prodid record instead of the well-known URL', () => {
		expect(planDiscovery('acme.example', ['v=spf1 -all', TXT])).toEqual({
			ok: true,
			plan: { via: 'dns-txt', documentUrl: DELEGATION, host: 'acme.prodid.org', delegated: true },
		})
	})

	test('follows a record that points back at the domain, and then nothing is delegated', () => {
		const own = 'v=prodid0; feed=https://acme.example/.well-known/prodid.json'
		expect(planDiscovery('acme.example', [own])).toEqual({
			ok: true,
			plan: { via: 'dns-txt', documentUrl: 'https://acme.example/.well-known/prodid.json', host: 'acme.example', delegated: false },
		})
	})

	test('refuses two prodid records rather than picking one', () => {
		expect(planDiscovery('acme.example', [TXT, TXT])).toEqual({ ok: false, reason: 'multiple-records' })
		expect(planDiscovery('acme.example', [TXT, 'v=prodid0; feed=https://evil.example/.well-known/prodid.json'])).toEqual({
			ok: false,
			reason: 'multiple-records',
		})
		expect(planDiscovery('acme.example', [TXT, 'v=prodid0'])).toEqual({ ok: false, reason: 'multiple-records' })
	})

	test('reports a broken record instead of falling back to the well-known URL', () => {
		expect(planDiscovery('acme.example', ['v=prodid0'])).toEqual({ ok: false, reason: 'missing-feed' })
		expect(planDiscovery('acme.example', ['v=prodid0; feed=https://evil.example/pwn.json'])).toEqual({ ok: false, reason: 'bad-feed-url' })
	})

	test('refuses a domain that is not a domain', () => {
		expect(planDiscovery('127.0.0.1', [])).toEqual({ ok: false, reason: 'bad-domain' })
	})
})

describe('isFeedAllowed', () => {
	test('accepts an https feed on the document host', () => {
		expect(isFeedAllowed('https://acme.example/prodid/items.ndjson', 'acme.example')).toBe(true)
	})

	test('refuses another host, another port, credentials and plain http', () => {
		expect(isFeedAllowed('https://cdn.acme.example/items.ndjson', 'acme.example')).toBe(false)
		expect(isFeedAllowed('https://acme.example:8443/items.ndjson', 'acme.example')).toBe(false)
		expect(isFeedAllowed('https://user@acme.example/items.ndjson', 'acme.example')).toBe(false)
		expect(isFeedAllowed('http://acme.example/items.ndjson', 'acme.example')).toBe(false)
		expect(isFeedAllowed('/items.ndjson', 'acme.example')).toBe(false)
	})
})

describe('acceptDiscovery', () => {
	test('accepts a document the domain serves itself', () => {
		expect(acceptDiscovery(response())).toEqual({
			ok: true,
			domain: 'acme.example',
			host: 'acme.example',
			delegated: false,
			document: DIRECT,
			feeds: DIRECT.feeds,
		})
	})

	test('accepts a delegated document that names the domain', () => {
		const decision = acceptDiscovery(response({ host: 'acme.prodid.org', delegated: true, body: DELEGATED }))
		expect(decision).toEqual({
			ok: true,
			domain: 'acme.example',
			host: 'acme.prodid.org',
			delegated: true,
			document: DELEGATED,
			feeds: DELEGATED.feeds,
		})
	})

	test('refuses a delegated document that names no domain', () => {
		const body = { ...DELEGATED, feeds: DELEGATED.feeds }
		delete (body as { domain?: string }).domain
		expect(acceptDiscovery(response({ host: 'acme.prodid.org', delegated: true, body }))).toEqual({ ok: false, reason: 'domain-missing' })
	})

	test('refuses a document that speaks for another domain, delegated or not', () => {
		expect(acceptDiscovery(response({ domain: 'rival.example', host: 'acme.prodid.org', delegated: true, body: DELEGATED }))).toEqual({
			ok: false,
			reason: 'domain-mismatch',
			detail: 'acme.example',
		})
		expect(acceptDiscovery(response({ body: { ...DIRECT, domain: 'rival.example' } }))).toEqual({
			ok: false,
			reason: 'domain-mismatch',
			detail: 'rival.example',
		})
	})

	test('refuses the whole document when any feed is off the document host', () => {
		const body = { ...DIRECT, feeds: ['https://acme.example/a.ndjson', 'https://cdn.example/b.ndjson'] }
		expect(acceptDiscovery(response({ body }))).toEqual({ ok: false, reason: 'feed-not-allowed', detail: 'https://cdn.example/b.ndjson' })
	})

	test('refuses anything that is not a 200 JSON document', () => {
		expect(acceptDiscovery(response({ status: 404 })).ok).toBe(false)
		expect(acceptDiscovery(response({ status: 301 }))).toEqual({ ok: false, reason: 'not-ok', detail: '301' })
		expect(acceptDiscovery(response({ contentType: 'text/html; charset=utf-8', body: undefined }))).toEqual({
			ok: false,
			reason: 'not-json',
			detail: 'text/html; charset=utf-8',
		})
		expect(acceptDiscovery(response({ contentType: null })).ok).toBe(false)
		expect(acceptDiscovery(response({ contentType: 'application/json; charset=utf-8' })).ok).toBe(true)
	})

	test('refuses a body that is not a feed document', () => {
		expect(acceptDiscovery(response({ body: { $type: 'org.prodid.feed', version: 1 } })).ok).toBe(false)
		expect(acceptDiscovery(response({ body: '<!doctype html>' })).ok).toBe(false)
		const rejected = acceptDiscovery(response({ body: {} }))
		expect(rejected.ok ? '' : rejected.reason).toBe('invalid-document')
	})

	test('refuses a domain or a host that is not a domain', () => {
		expect(acceptDiscovery(response({ domain: '127.0.0.1' }))).toEqual({ ok: false, reason: 'bad-domain' })
		expect(acceptDiscovery(response({ host: '169.254.169.254' }))).toEqual({ ok: false, reason: 'bad-host' })
	})
})

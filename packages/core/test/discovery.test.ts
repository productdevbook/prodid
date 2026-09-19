import { describe, expect, test } from 'bun:test'

import {
	acceptDiscovery,
	checkFetchable,
	decodeTxtPresentation,
	delegationUrl,
	type DiscoveryPlan,
	type DiscoveryResponse,
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

const HOST = 'acme.prodid.org'
const DOCUMENT = `https://${HOST}/.well-known/prodid.json`
const TXT = `v=prodid0; host=${HOST}`
const TXT_VECTORS = new URL('../../../spec/fixtures/txt/', import.meta.url)

interface TxtVector {
	name: string
	value: string[]
	outcome: 'delegation' | 'ignored' | 'malformed'
	host?: string
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
	feeds: [`https://${HOST}/feeds/items.ndjson`],
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
		expect(isDnsName('acme.example.')).toBe(false)
		expect(isDnsName(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(59)}.example`)).toBe(false)
	})
})

describe('wellKnownUrl, txtName and delegationUrl', () => {
	test('build the discovery locations for a domain', () => {
		expect(wellKnownUrl('Acme.Example')).toBe('https://acme.example/.well-known/prodid.json')
		expect(txtName('Acme.Example')).toBe('_prodid.acme.example')
		expect(delegationUrl(HOST)).toBe(DOCUMENT)
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

	test('an absolute name with the root dot is the same host, not a refusal', () => {
		expect(checkFetchable('https://acme.example./f.ndjson')).toEqual({ ok: true, host: 'acme.example' })
		expect(isFeedAllowed('https://acme.example./f.ndjson', 'acme.example')).toBe(true)
		expect(isFeedAllowed('https://acme.example/f.ndjson', 'ACME.example.')).toBe(true)
		expect(checkFetchable('https://acme.example../f.ndjson')).toEqual({ ok: false, reason: 'not-a-dns-name' })
	})
})

describe('decodeTxtPresentation', () => {
	test('splits the quoted form a DoH answer returns back into character strings', () => {
		expect(decodeTxtPresentation('"v=prodid0; " "host=a.example"')).toEqual(['v=prodid0; ', 'host=a.example'])
		expect(decodeTxtPresentation('"v=prodid0; host=a.example"')).toEqual(['v=prodid0; host=a.example'])
		expect(decodeTxtPresentation('v=prodid0;host=a.example')).toEqual(['v=prodid0;host=a.example'])
	})

	test('decodes the escapes RFC 1035 defines and nothing else', () => {
		expect(decodeTxtPresentation('"a\\"b"')).toEqual(['a"b'])
		expect(decodeTxtPresentation('"a\\\\b"')).toEqual(['a\\b'])
		expect(decodeTxtPresentation('"a\\059b"')).toEqual(['a;b'])
		expect(decodeTxtPresentation('"\\255"')).toEqual([String.fromCharCode(255)])
	})

	test('refuses what it cannot parse rather than approximating', () => {
		expect(decodeTxtPresentation('"unterminated')).toBeNull()
		expect(decodeTxtPresentation('"a" b"c"')).toBeNull()
		expect(decodeTxtPresentation('"a\\25"')).toBeNull()
		expect(decodeTxtPresentation('"a\\256"')).toBeNull()
		expect(decodeTxtPresentation('"a\\')).toBeNull()
		expect(decodeTxtPresentation('')).toBeNull()
		expect(decodeTxtPresentation('   ')).toBeNull()
	})

	test('feeds the parser what the publisher actually wrote', () => {
		const decoded = decodeTxtPresentation(`"v=prodid0; host=acme.pro" "did.org"`)
		expect(decoded).not.toBeNull()
		expect(parseDiscoveryTxt(decoded!)).toEqual({ ok: true, version: 'prodid0', host: HOST })
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

describe('parseDiscoveryTxt', () => {
	test('reads the documented form', () => {
		expect(parseDiscoveryTxt(TXT)).toEqual({ ok: true, version: 'prodid0', host: HOST })
	})

	test('tolerates whitespace around the separators and ignores unknown tags', () => {
		expect(parseDiscoveryTxt(`  v = prodid0 ;  host = ${HOST}  ;  note=hello ; `)).toEqual({
			ok: true,
			version: 'prodid0',
			host: HOST,
		})
	})

	test('concatenates the character strings of one record with nothing between them', () => {
		expect(parseDiscoveryTxt(['v=prodid0; host=acme.pro', 'did.org'])).toEqual({ ok: true, version: 'prodid0', host: HOST })
	})

	test('never guesses at transport quoting, so a quoted tag value survives', () => {
		// Unquoting here turned `note="x"` into `"x"`, which is not a prodid record, and the plan
		// then quietly fell back to .well-known: the downgrade DNS-first exists to prevent.
		expect(parseDiscoveryTxt(`v=prodid0; host=${HOST}; note="x"`)).toEqual({ ok: true, version: 'prodid0', host: HOST })
		expect(parseDiscoveryTxt(['v=prodid0; host=a.example', '; n=\\"q\\"'])).toMatchObject({ ok: true, host: 'a.example' })
		expect(planDiscovery('acme.example', [`v=prodid0; host=${HOST}; note="x"`])).toMatchObject({
			ok: true,
			plan: { via: 'dns-txt', host: HOST },
		})
	})

	test('is not a prodid record unless v=prodid0 comes first', () => {
		expect(parseDiscoveryTxt(`host=${HOST}; v=prodid0`)).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt(`v=prodid1; host=${HOST}`)).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt(`V=PRODID0; host=${HOST}`)).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt('v=spf1 include:example.com ~all')).toEqual({ ok: false, reason: 'not-prodid' })
		expect(parseDiscoveryTxt('')).toEqual({ ok: false, reason: 'not-prodid' })
	})

	test('refuses an empty tag, a repeated tag and a tag the grammar does not allow', () => {
		expect(parseDiscoveryTxt(`v=prodid0;; host=${HOST}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; host=${HOST}; host=evil.example`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt('v=prodid0; hello')).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; Host=${HOST}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; 1st=x; host=${HOST}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt(`v=prodid0; note=two words; host=${HOST}`)).toEqual({ ok: false, reason: 'malformed' })
		expect(parseDiscoveryTxt('v=prodid0 extra')).toEqual({ ok: false, reason: 'malformed' })
	})

	test('refuses a record longer than the spec allows', () => {
		expect(parseDiscoveryTxt(`v=prodid0; host=${HOST}; note=${'x'.repeat(512)}`)).toEqual({ ok: false, reason: 'malformed' })
	})

	test('refuses a missing host and anything that is not a bare host', () => {
		expect(parseDiscoveryTxt('v=prodid0')).toEqual({ ok: false, reason: 'missing-host' })
		expect(parseDiscoveryTxt('v=prodid0; note=hello')).toEqual({ ok: false, reason: 'missing-host' })
		for (const host of [
			DOCUMENT,
			`https://${HOST}`,
			`${HOST}:8443`,
			`${HOST}/.well-known/prodid.json`,
			`acme@${HOST}`,
			`${HOST}?v=2`,
			`${HOST}#x`,
			'192.0.2.10',
			'[::1]',
			'localhost',
			'acme.prodid.org..',
			`${'a'.repeat(250)}.example`,
		]) {
			expect(parseDiscoveryTxt(`v=prodid0; host=${host}`)).toEqual({ ok: false, reason: 'bad-host' })
		}
		// A U-label is not even ASCII, so it breaks the tag grammar before the host rule sees it.
		expect(parseDiscoveryTxt('v=prodid0; host=açme.example')).toEqual({ ok: false, reason: 'malformed' })
	})

	test('a capital letter or a root dot does not cost a publisher its catalogue', () => {
		expect(parseDiscoveryTxt('v=prodid0; host=ACME.Prodid.org.')).toEqual({ ok: true, version: 'prodid0', host: HOST })
		expect(parseDiscoveryTxt(`v=prodid0; host=${HOST}.`)).toEqual({ ok: true, version: 'prodid0', host: HOST })
		expect(planDiscovery('acme.example', ['v=prodid0; host=ACME.example.'])).toEqual({
			ok: true,
			plan: { via: 'dns-txt', documentUrl: 'https://acme.example/.well-known/prodid.json', host: 'acme.example', delegated: false },
		})
	})

	test('agrees with every conformance vector the spec ships', async () => {
		const vectors = await txtVectors()
		expect(vectors.length).toBeGreaterThan(0)
		for (const vector of vectors) {
			const result = parseDiscoveryTxt(vector.value)
			const outcome = result.ok ? 'delegation' : result.reason === 'not-prodid' ? 'ignored' : 'malformed'
			if (outcome !== vector.outcome) {
				throw new Error(`fixtures/txt/${vector.name}: expected ${vector.outcome}, got ${outcome} ${JSON.stringify(result)}`)
			}
			if (result.ok && result.host !== vector.host) {
				throw new Error(`fixtures/txt/${vector.name}: expected host ${vector.host}, got ${result.host}`)
			}
		}
	})
})

describe('planDiscovery', () => {
	test('falls back to the well-known URL when there is no prodid record', () => {
		const other: TxtRecord[] = ['v=spf1 include:example.com ~all', ['google-site-verification=abc']]
		const plan: DiscoveryPlan = {
			via: 'well-known',
			documentUrl: 'https://acme.example/.well-known/prodid.json',
			host: 'acme.example',
			delegated: false,
		}
		expect(planDiscovery('Acme.Example', other)).toEqual({ ok: true, plan })
		expect(planDiscovery('acme.example', [])).toEqual({ ok: true, plan })
	})

	test('follows a prodid record instead of the well-known URL', () => {
		expect(planDiscovery('acme.example', ['v=spf1 -all', TXT])).toEqual({
			ok: true,
			plan: { via: 'dns-txt', documentUrl: DOCUMENT, host: HOST, delegated: true },
		})
	})

	test('follows a record that points back at the domain, and then nothing is delegated', () => {
		expect(planDiscovery('acme.example', ['v=prodid0; host=acme.example'])).toEqual({
			ok: true,
			plan: { via: 'dns-txt', documentUrl: 'https://acme.example/.well-known/prodid.json', host: 'acme.example', delegated: false },
		})
	})

	test('refuses two prodid records rather than picking one', () => {
		expect(planDiscovery('acme.example', [TXT, TXT])).toEqual({ ok: false, reason: 'multiple-records' })
		expect(planDiscovery('acme.example', [TXT, 'v=prodid0; host=evil.example'])).toEqual({ ok: false, reason: 'multiple-records' })
		expect(planDiscovery('acme.example', [TXT, 'v=prodid0'])).toEqual({ ok: false, reason: 'multiple-records' })
	})

	test('a broken record fails discovery and never falls through to the well-known URL', () => {
		expect(planDiscovery('acme.example', ['v=prodid0'])).toEqual({ ok: false, reason: 'missing-host' })
		expect(planDiscovery('acme.example', ['v=prodid0; host=https://evil.example/pwn.json'])).toEqual({ ok: false, reason: 'bad-host' })
		expect(planDiscovery('acme.example', [`v=prodid0; host=${HOST}; note=${'x'.repeat(512)}`])).toEqual({ ok: false, reason: 'malformed' })
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
	test('accepts a document the domain serves itself, with or without naming itself', () => {
		expect(acceptDiscovery(response())).toEqual({
			ok: true,
			domain: 'acme.example',
			host: 'acme.example',
			delegated: false,
			document: DIRECT,
			feeds: DIRECT.feeds,
		})
		expect(acceptDiscovery(response({ body: { ...DIRECT, domain: 'acme.example' } })).ok).toBe(true)
	})

	test('accepts a delegated document that names the domain', () => {
		expect(acceptDiscovery(response({ host: HOST, delegated: true, body: DELEGATED }))).toEqual({
			ok: true,
			domain: 'acme.example',
			host: HOST,
			delegated: true,
			document: DELEGATED,
			feeds: DELEGATED.feeds,
		})
	})

	test('refuses a delegated document that names no domain, however the crawler got there', () => {
		const anonymous: FeedRecord = {
			$type: 'org.prodid.feed',
			version: 0,
			publisher: { name: 'Acme Tekstil' },
			license: 'CC0-1.0',
			feeds: DELEGATED.feeds,
		}
		// evil.example delegates to a slug host whose document speaks for nobody: it must not become evil.example's.
		expect(acceptDiscovery(response({ domain: 'evil.example', host: HOST, delegated: true, body: anonymous }))).toEqual({
			ok: false,
			reason: 'domain-missing',
		})
		expect(acceptDiscovery(response({ host: HOST, delegated: true, body: anonymous }))).toEqual({ ok: false, reason: 'domain-missing' })
	})

	test('refuses a document that speaks for another domain, delegated or not', () => {
		expect(acceptDiscovery(response({ domain: 'rival.example', host: HOST, delegated: true, body: DELEGATED }))).toEqual({
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

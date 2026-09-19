import { classifyAddress } from './address'
import { validateFeed } from './record/index'
import type { FeedRecord } from './record/types'

export const WELL_KNOWN_PATH = '/.well-known/prodid.json'
export const TXT_PREFIX = '_prodid.'
export const TXT_VERSION = 'prodid0'

const DNS_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const JSON_MEDIA_TYPE = /^application\/(?:[\w.+-]+\+)?json$/i
const TAG_SEPARATOR = /[ \t]*;[ \t]*/
const PRODID_RECORD = /^[ \t]*v[ \t]*=[ \t]*prodid0(?=$|[ \t;])/
const TAG_NAME = /^[a-z][a-z0-9-]*$/
const TAG_VALUE = /^[!-:<-~]*$/
const MAX_TXT_BYTES = 512
const DIGIT = /^[0-9]$/
const DECIMAL_ESCAPE = /^[0-9]{3}$/

/** One TXT resource record: its character-strings, which concatenate with nothing between them. */
export type TxtRecord = string | readonly string[]

export type DiscoveryVia = 'dns-txt' | 'well-known'

// --- names -----------------------------------------------------------------

/** True for a DNS name a crawler may resolve: lowercase, at least two labels, never an IP literal. */
export function isDnsName(host: string): boolean {
	if (!DNS_NAME.test(host)) return false
	return classifyAddress(host) === 'invalid'
}

/**
 * DNS names are case-insensitive and may be written with one trailing root dot, so neither costs a
 * publisher their catalogue. ASCII only: a U-label is not a DNS name and is not guessed at.
 */
export function normalizeHost(host: string): string | null {
	const normalized = host.toLowerCase().replace(/\.$/, '')
	return isDnsName(normalized) ? normalized : null
}

/** Lowercased, punycoded hostname, or null if the input is not a domain a source can be identified by. */
export function normalizeDomain(domain: string): string | null {
	const trimmed = domain.trim().replace(/\.$/, '')
	if (trimmed === '' || /[\s/\\?#@:[\]]/.test(trimmed)) return null
	let url: URL
	try {
		url = new URL(`https://${trimmed}/`)
	} catch {
		return null
	}
	if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null
	return isDnsName(url.hostname) ? url.hostname : null
}

export function wellKnownUrl(domain: string): string | null {
	const host = normalizeDomain(domain)
	return host === null ? null : `https://${host}${WELL_KNOWN_PATH}`
}

export function txtName(domain: string): string | null {
	const host = normalizeDomain(domain)
	return host === null ? null : `${TXT_PREFIX}${host}`
}

// --- fetch guard -----------------------------------------------------------

export type FetchRejection = 'not-a-url' | 'not-https' | 'not-default-port' | 'has-credentials' | 'not-a-dns-name'

export type FetchCheck = { ok: true; host: string } | { ok: false; reason: FetchRejection }

/** Whether a URL may be fetched at all, before anything is known about where it resolves. */
export function checkFetchable(url: string): FetchCheck {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		return { ok: false, reason: 'not-a-url' }
	}
	if (parsed.protocol !== 'https:') return { ok: false, reason: 'not-https' }
	if (parsed.port !== '') return { ok: false, reason: 'not-default-port' }
	if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'has-credentials' }
	const host = normalizeHost(parsed.hostname)
	return host === null ? { ok: false, reason: 'not-a-dns-name' } : { ok: true, host }
}

/** A redirect may only stay on the host the crawler asked for, or add the `www.` label to it. */
export function isRedirectAllowed(from: string, to: string): boolean {
	const source = checkFetchable(from)
	const target = checkFetchable(to)
	if (!source.ok || !target.ok) return false
	return target.host === source.host || target.host === `www.${source.host}`
}

// --- the TXT record --------------------------------------------------------

export type TxtRejection = 'not-prodid' | 'malformed' | 'missing-host' | 'bad-host'

export interface TxtDelegation {
	version: typeof TXT_VERSION
	/** The host serving the document. The record names a host, never a URL, so the path stays fixed. */
	host: string
}

export type TxtResult = ({ ok: true } & TxtDelegation) | { ok: false; reason: TxtRejection }

/**
 * Joins one record's character-strings, which concatenate with nothing between them. The strings are
 * taken as they are: guessing at a transport's quoting here would rewrite what a publisher wrote.
 * A caller holding presentation format decodes it with `decodeTxtPresentation` first.
 */
export function joinTxtRecord(record: TxtRecord): string {
	return typeof record === 'string' ? record : record.join('')
}

/**
 * Decodes the RFC 1035 presentation format a DoH JSON answer puts in `data` into the record's
 * character-strings: `"\\"a\\" \\"b\\""` becomes `['a', 'b']`. Handles `\\"`, `\\\\` and `\\DDD`, and
 * bare unquoted tokens. Returns null rather than a guess when the input does not parse.
 */
export function decodeTxtPresentation(data: string): string[] | null {
	const strings: string[] = []
	let at = 0
	while (at < data.length) {
		const start = data[at]!
		if (start === ' ' || start === '\t') {
			at += 1
			continue
		}
		const decoded = start === '"' ? readQuoted(data, at) : readBare(data, at)
		if (decoded === null) return null
		strings.push(decoded.text)
		at = decoded.at
	}
	return strings.length === 0 ? null : strings
}

/**
 * Reads `v=prodid0; host=<host>`. The version tag comes first and the record names a bare host, so
 * there is no port, path or query for it to express and it can never aim the crawler somewhere odd.
 */
export function parseDiscoveryTxt(record: TxtRecord): TxtResult {
	const joined = joinTxtRecord(record)
	if (!PRODID_RECORD.test(joined)) return { ok: false, reason: 'not-prodid' }
	if (new TextEncoder().encode(joined).length > MAX_TXT_BYTES) return { ok: false, reason: 'malformed' }

	const parts = joined.trim().split(TAG_SEPARATOR)
	if (parts.at(-1) === '') parts.pop()

	const version = readTag(parts[0])
	if (version === null || version.value !== TXT_VERSION) return { ok: false, reason: 'malformed' }

	const tags = new Map([[version.name, version.value]])
	for (const part of parts.slice(1)) {
		const tag = readTag(part)
		if (tag === null || tags.has(tag.name)) return { ok: false, reason: 'malformed' }
		tags.set(tag.name, tag.value)
	}

	const written = tags.get('host')
	if (written === undefined) return { ok: false, reason: 'missing-host' }
	const host = normalizeHost(written)
	return host === null ? { ok: false, reason: 'bad-host' } : { ok: true, version: TXT_VERSION, host }
}

/** Where a delegation to `<host>` is fetched from. The path is fixed, so the host decides everything. */
export function delegationUrl(host: string): string {
	return `https://${host}${WELL_KNOWN_PATH}`
}

// --- step one: what to fetch -----------------------------------------------

export type PlanRejection = 'bad-domain' | 'multiple-records' | Exclude<TxtRejection, 'not-prodid'>

export interface DiscoveryPlan {
	via: DiscoveryVia
	documentUrl: string
	host: string
	/** The document must name the domain, because DNS sent the crawler to another host. */
	delegated: boolean
}

export type PlanResult = { ok: true; plan: DiscoveryPlan } | { ok: false; reason: PlanRejection }

/**
 * Decides what discovery fetches next for a domain. A `v=prodid0` record is followed exclusively,
 * even when it points back at the domain; the well-known URL is used only when there is no record.
 */
export function planDiscovery(domain: string, records: readonly TxtRecord[]): PlanResult {
	const host = normalizeDomain(domain)
	if (host === null) return { ok: false, reason: 'bad-domain' }

	const delegations: TxtDelegation[] = []
	const broken: PlanRejection[] = []
	for (const record of records) {
		const result = parseDiscoveryTxt(record)
		if (result.ok) delegations.push(result)
		else if (result.reason !== 'not-prodid') broken.push(result.reason)
	}
	if (delegations.length + broken.length > 1) return { ok: false, reason: 'multiple-records' }

	const reason = broken[0]
	if (reason !== undefined) return { ok: false, reason }
	const delegation = delegations[0]
	if (delegation === undefined) return { ok: true, plan: { via: 'well-known', documentUrl: delegationUrl(host), host, delegated: false } }
	return {
		ok: true,
		plan: {
			via: 'dns-txt',
			documentUrl: delegationUrl(delegation.host),
			host: delegation.host,
			delegated: delegation.host !== host,
		},
	}
}

// --- step two: whether the answer counts -----------------------------------

export type DiscoveryRejection =
	| 'bad-domain'
	| 'bad-host'
	| 'not-ok'
	| 'not-json'
	| 'invalid-document'
	| 'domain-missing'
	| 'domain-mismatch'
	| 'feed-not-allowed'

export interface DiscoveryResponse {
	domain: string
	/** The host the document came from, after any redirect the policy allowed. */
	host: string
	/** Whether DNS sent the crawler to a host other than the domain. */
	delegated: boolean
	status: number
	contentType: string | null
	/** The parsed JSON body, or undefined when the response did not parse as JSON. */
	body: unknown
}

export type DiscoveryDecision =
	| { ok: true; domain: string; host: string; delegated: boolean; document: FeedRecord; feeds: string[] }
	| { ok: false; reason: DiscoveryRejection; detail?: string }

/** A feed is fetchable and served from the same host as the document that lists it. */
export function isFeedAllowed(feedUrl: string, host: string): boolean {
	const fetchable = checkFetchable(feedUrl)
	const expected = normalizeHost(host)
	return fetchable.ok && expected !== null && fetchable.host === expected
}

/**
 * Decides whether a fetched response is a discovery document that speaks for the domain. Only
 * 200 with a JSON body that validates and agrees about the domain counts; anything else is silence.
 */
export function acceptDiscovery(response: DiscoveryResponse): DiscoveryDecision {
	const domain = normalizeDomain(response.domain)
	if (domain === null) return { ok: false, reason: 'bad-domain' }
	const host = normalizeHost(response.host)
	if (host === null) return { ok: false, reason: 'bad-host' }
	if (response.status !== 200) return { ok: false, reason: 'not-ok', detail: String(response.status) }
	if (!isJsonMediaType(response.contentType)) return { ok: false, reason: 'not-json', detail: response.contentType ?? '' }

	const parsed = validateFeed(response.body)
	if (!parsed.ok) {
		const first = parsed.errors[0]
		return { ok: false, reason: 'invalid-document', detail: first === undefined ? '' : `${first.path} ${first.message}` }
	}

	const doc = parsed.value
	if (doc.domain === undefined) {
		if (response.delegated) return { ok: false, reason: 'domain-missing' }
	} else if (normalizeDomain(doc.domain) !== domain) {
		return { ok: false, reason: 'domain-mismatch', detail: doc.domain }
	}

	for (const feed of doc.feeds) {
		if (!isFeedAllowed(feed, host)) return { ok: false, reason: 'feed-not-allowed', detail: feed }
	}
	return { ok: true, domain, host, delegated: response.delegated, document: doc, feeds: [...doc.feeds] }
}

function readTag(part: string | undefined): { name: string; value: string } | null {
	if (part === undefined) return null
	const separator = part.indexOf('=')
	if (separator === -1) return null
	const name = part.slice(0, separator).trim()
	const value = part.slice(separator + 1).trim()
	return TAG_NAME.test(name) && TAG_VALUE.test(value) ? { name, value } : null
}

function isJsonMediaType(contentType: string | null): boolean {
	if (contentType === null) return false
	return JSON_MEDIA_TYPE.test(contentType.split(';')[0]!.trim())
}

function readQuoted(data: string, from: number): { text: string; at: number } | null {
	let text = ''
	let at = from + 1
	while (at < data.length) {
		const character = data[at]!
		if (character === '"') return { text, at: at + 1 }
		if (character !== '\\') {
			text += character
			at += 1
			continue
		}
		const escaped = readEscape(data, at)
		if (escaped === null) return null
		text += escaped.text
		at = escaped.at
	}
	return null
}

function readBare(data: string, from: number): { text: string; at: number } | null {
	let text = ''
	let at = from
	while (at < data.length) {
		const character = data[at]!
		if (character === ' ' || character === '\t') break
		if (character === '"') return null
		if (character !== '\\') {
			text += character
			at += 1
			continue
		}
		const escaped = readEscape(data, at)
		if (escaped === null) return null
		text += escaped.text
		at = escaped.at
	}
	return text === '' ? null : { text, at }
}

function readEscape(data: string, at: number): { text: string; at: number } | null {
	const next = data[at + 1]
	if (next === undefined) return null
	if (!DIGIT.test(next)) return { text: next, at: at + 2 }
	const digits = data.slice(at + 1, at + 4)
	if (digits.length !== 3 || !DECIMAL_ESCAPE.test(digits)) return null
	const code = Number(digits)
	return code > 255 ? null : { text: String.fromCharCode(code), at: at + 4 }
}

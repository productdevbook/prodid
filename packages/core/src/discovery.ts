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
const QUOTED = /"((?:[^"\\]|\\.)*)"/g

/** One TXT resource record: its character-strings, which concatenate with nothing between them. */
export type TxtRecord = string | readonly string[]

export type DiscoveryVia = 'dns-txt' | 'well-known'

// --- names -----------------------------------------------------------------

/** True for a DNS name a crawler may resolve: lowercase, at least two labels, never an IP literal. */
export function isDnsName(host: string): boolean {
	if (!DNS_NAME.test(host)) return false
	return classifyAddress(host) === 'invalid'
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
	if (!isDnsName(parsed.hostname)) return { ok: false, reason: 'not-a-dns-name' }
	return { ok: true, host: parsed.hostname }
}

/** A redirect may only stay on the host the crawler asked for, or add the `www.` label to it. */
export function isRedirectAllowed(from: string, to: string): boolean {
	const source = checkFetchable(from)
	const target = checkFetchable(to)
	if (!source.ok || !target.ok) return false
	return target.host === source.host || target.host === `www.${source.host}`
}

// --- the TXT record --------------------------------------------------------

export type TxtRejection = 'not-prodid' | 'malformed' | 'missing-feed' | 'bad-feed-url'

export interface TxtDelegation {
	version: typeof TXT_VERSION
	/** The discovery document URL the record names, always `https://<host>/.well-known/prodid.json`. */
	feed: string
	host: string
}

export type TxtResult = ({ ok: true } & TxtDelegation) | { ok: false; reason: TxtRejection }

/** Joins one record's character-strings, accepting the quoted form a DNS API hands back. */
export function joinTxtRecord(record: TxtRecord): string {
	return (typeof record === 'string' ? [record] : record).map(unquote).join('')
}

/**
 * Reads `v=prodid0; feed=https://<host>/.well-known/prodid.json`. The version tag comes first and
 * the feed is that exact URL and nothing else, so a record can never aim the crawler somewhere odd.
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

	const feed = tags.get('feed')
	if (feed === undefined) return { ok: false, reason: 'missing-feed' }
	const host = delegationHost(feed)
	return host === null ? { ok: false, reason: 'bad-feed-url' } : { ok: true, version: TXT_VERSION, feed, host }
}

/** The host of a well-formed delegation target, or null. The URL has to be written exactly this way. */
export function delegationHost(value: string): string | null {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return null
	}
	if (url.href !== value || url.pathname !== WELL_KNOWN_PATH || url.search !== '' || url.hash !== '') return null
	const fetchable = checkFetchable(value)
	return fetchable.ok ? fetchable.host : null
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
	if (delegation === undefined) {
		return { ok: true, plan: { via: 'well-known', documentUrl: `https://${host}${WELL_KNOWN_PATH}`, host, delegated: false } }
	}
	return { ok: true, plan: { via: 'dns-txt', documentUrl: delegation.feed, host: delegation.host, delegated: delegation.host !== host } }
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
	return fetchable.ok && fetchable.host === host
}

/**
 * Decides whether a fetched response is a discovery document that speaks for the domain. Only
 * 200 with a JSON body that validates and agrees about the domain counts; anything else is silence.
 */
export function acceptDiscovery(response: DiscoveryResponse): DiscoveryDecision {
	const domain = normalizeDomain(response.domain)
	if (domain === null) return { ok: false, reason: 'bad-domain' }
	const host = normalizeDomain(response.host)
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

function unquote(part: string): string {
	const quoted = [...part.matchAll(QUOTED)]
	if (quoted.length === 0) return part
	return quoted.map((match) => match[1]!.replace(/\\(.)/g, '$1')).join('')
}

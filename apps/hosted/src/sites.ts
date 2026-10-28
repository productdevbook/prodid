import { canonicalize, type FeedPublisher, type FeedRecord, normalizeDomain, sha256Hex, validateFeed } from '@prodid/core'

import { siteHost } from './names'

export interface StoredObject {
	body: ReadableStream<Uint8Array>
	etag: string
	uploaded: Date
	size: number
}

/** The slice of R2 the publisher uses, so tests can stand in for the bucket. */
export interface Blobs {
	get(key: string): Promise<StoredObject | null>
	text(key: string): Promise<string | null>
	put(key: string, body: ArrayBuffer | string, contentType: string): Promise<void>
	delete(keys: string[]): Promise<void>
	slugs(): Promise<string[]>
}

export interface Site {
	slug: string
	publisher: FeedPublisher
	license: string
	/** The domain the publisher says it is. Served only once `verified` names it too. */
	domain?: string
	/** The domain whose `_prodid` record was last seen naming this host. */
	verified?: string
	verifiedAt?: string
	feeds: string[]
	updatedAt: string
}

const siteKey = (slug: string): string => `sites/${slug}/site.json`
export const feedKey = (slug: string, name: string): string => `sites/${slug}/feeds/${name}`

export async function readSite(blobs: Blobs, slug: string): Promise<Site | null> {
	const text = await blobs.text(siteKey(slug))
	return text === null ? null : (JSON.parse(text) as Site)
}

export function writeSite(blobs: Blobs, site: Site): Promise<void> {
	return blobs.put(siteKey(site.slug), JSON.stringify(site), 'application/json')
}

export async function deleteSite(blobs: Blobs, site: Site): Promise<void> {
	await blobs.delete([...site.feeds.map((name) => feedKey(site.slug, name)), siteKey(site.slug)])
}

/**
 * The discovery document as served. `domain` is written only for a verified domain: a document
 * naming a domain that does not delegate to this host speaks for nobody, and the slug would stop
 * being discoverable even as itself.
 */
export function siteDocument(site: Site, zone: string): FeedRecord | null {
	if (site.feeds.length === 0) return null
	const host = siteHost(site.slug, zone)
	const document: FeedRecord = {
		$type: 'org.prodid.feed',
		version: 0,
		publisher: site.publisher,
		license: site.license,
		feeds: site.feeds.map((name) => `https://${host}/feeds/${name}`),
	}
	if (site.verified !== undefined && site.verified === site.domain) document.domain = site.verified
	return document
}

export async function documentEtag(document: FeedRecord): Promise<string> {
	return `"${(await sha256Hex(canonicalize(document))).slice(0, 32)}"`
}

export interface SiteInput {
	publisher: FeedPublisher
	license: string
	domain?: string
}

export type SiteInputResult = { ok: true; input: SiteInput } | { ok: false; detail: string }

/**
 * Checked through the feed schema with a stand-in feed, so a site can never be saved in a shape
 * whose document the crawler would reject.
 */
export function parseSiteInput(body: unknown, zone: string): SiteInputResult {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, detail: 'body is not an object' }
	const { publisher, license, domain, ...rest } = body as Record<string, unknown>
	const unknown = Object.keys(rest)
	if (unknown.length > 0) return { ok: false, detail: `unknown field ${unknown[0]}` }

	let normalized: string | undefined
	if (domain !== undefined && domain !== null) {
		if (typeof domain !== 'string') return { ok: false, detail: 'domain is not a string' }
		const name = normalizeDomain(domain)
		if (name === null) return { ok: false, detail: 'domain is not a domain name' }
		const suffix = `.${zone.toLowerCase()}`
		if (name === zone.toLowerCase() || name.endsWith(suffix)) return { ok: false, detail: 'domain is inside the hosting zone' }
		normalized = name
	}

	const probe = validateFeed({
		$type: 'org.prodid.feed',
		version: 0,
		publisher,
		license,
		feeds: ['https://probe.invalid/feed.ndjson'],
		...(normalized === undefined ? {} : { domain: normalized }),
	})
	if (!probe.ok) {
		const error = probe.errors[0]
		return { ok: false, detail: error === undefined ? 'invalid site' : `${error.path || '/'} ${error.message}` }
	}
	const input: SiteInput = { publisher: publisher as FeedPublisher, license: license as string }
	if (normalized !== undefined) input.domain = normalized
	return { ok: true, input }
}

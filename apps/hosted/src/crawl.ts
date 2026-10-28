import { type SourceRecord, validateSource } from '@prodid/core'

import { siteHost } from './names'
import type { Site } from './sites'

export type IndexView = { state: 'crawled'; source: SourceRecord } | { state: 'not-crawled' } | { state: 'unavailable' }

const TIMEOUT_MS = 5_000

/** The name the index files the site under: its verified domain, else the slug host. */
export function indexName(site: Site, zone: string): string {
	return site.verified !== undefined && site.verified === site.domain ? site.verified : siteHost(site.slug, zone)
}

/**
 * The index's public status page, read over HTTPS like anybody else would. A 404 is the one answer
 * meaning "not crawled yet": the index has no row for a name before its first successful discovery.
 */
export async function readIndexView(base: string, name: string, fetcher: typeof fetch = fetch): Promise<IndexView> {
	let response: Response
	try {
		response = await fetcher(`${base}${encodeURIComponent(name)}`, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
	} catch {
		return { state: 'unavailable' }
	}
	if (response.status === 404) {
		await response.body?.cancel()
		return { state: 'not-crawled' }
	}
	if (!response.ok) {
		await response.body?.cancel()
		return { state: 'unavailable' }
	}
	let body: unknown
	try {
		body = await response.json()
	} catch {
		return { state: 'unavailable' }
	}
	const checked = validateSource(body)
	return checked.ok ? { state: 'crawled', source: checked.value } : { state: 'unavailable' }
}

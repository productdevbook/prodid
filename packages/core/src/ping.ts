import { normalizeDomain } from './discovery'

export const MAX_PING_DOMAINS = 1000

export type PingRejection = 'not-an-object' | 'missing-domain' | 'too-many-domains' | 'bad-domain'

export type PingResult = { ok: true; domains: string[] } | { ok: false; reason: PingRejection; detail?: string }

/**
 * Validates a ping body: `{"domain": "..."}` or `{"domains": [...]}`. The result is the normalized
 * domains with duplicates collapsed, in the order they were first asked for.
 */
export function parsePingRequest(body: unknown): PingResult {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, reason: 'not-an-object' }

	const requested = readRequested(body as { domain?: unknown; domains?: unknown })
	if (requested === null) return { ok: false, reason: 'missing-domain' }
	if (requested.length > MAX_PING_DOMAINS) return { ok: false, reason: 'too-many-domains', detail: String(requested.length) }

	const domains = new Set<string>()
	for (const entry of requested) {
		const normalized = normalizeDomain(entry)
		if (normalized === null) return { ok: false, reason: 'bad-domain', detail: entry.slice(0, 64) }
		domains.add(normalized)
	}
	return { ok: true, domains: [...domains] }
}

function readRequested(body: { domain?: unknown; domains?: unknown }): string[] | null {
	if (body.domain !== undefined && body.domains !== undefined) return null
	if (body.domains === undefined) return typeof body.domain === 'string' ? [body.domain] : null
	if (!Array.isArray(body.domains) || body.domains.length === 0) return null
	return body.domains.every((entry) => typeof entry === 'string') ? (body.domains as string[]) : null
}

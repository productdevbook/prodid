export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000

/** The spec's rate limits. They are security controls, so they are counted once globally, not per datacentre. */
export const POLICY = {
	/** Discovery of one domain: 1 per 10 minutes. */
	domainWindowMs: 10 * MINUTE_MS,
	/** First contact with domains sharing one registrable domain: 1000 per hour. */
	registrable: { limit: 1000, windowMs: HOUR_MS },
	/** Ping requests from one caller: 60 per hour. */
	caller: { limit: 60, windowMs: HOUR_MS },
	/** Fetches of one host, in two lanes that both scale with the sources verified there. */
	host: { windowMs: MINUTE_MS, staleAfterMs: 5 * MINUTE_MS },
	/** How long a crawl held back by these limits waits before it is tried again. */
	maxDeferralSeconds: 3600,
	maxDeferrals: 12,
	/** How long a crawl waits when the limiter itself could not be asked. */
	limiterOutageMs: 60_000,
} as const

/** IPv4 to its /32 and IPv6 to its /64: one caller is one address block, not one address. */
export function callerKey(address: string | null): string {
	const value = (address ?? '').trim()
	if (value === '') return 'unknown'
	if (!value.includes(':')) return value
	const groups = expandIpv6(value)
	return groups === null ? value.toLowerCase() : groups.slice(0, 4).join(':')
}

function expandIpv6(value: string): string[] | null {
	const text = value.replace(/^\[|\]$/g, '').split('%')[0] ?? ''
	const sides = text.split('::')
	if (sides.length > 2) return null
	const head = sides[0] === '' ? [] : sides[0]!.split(':')
	const tail = sides.length === 2 ? (sides[1] === '' ? [] : sides[1]!.split(':')) : null
	const written = head.length + (tail?.length ?? 0)
	if (tail === null ? written !== 8 : written > 7) return null
	const groups = tail === null ? head : [...head, ...Array.from({ length: 8 - written }, () => '0'), ...tail]
	return groups.map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
}

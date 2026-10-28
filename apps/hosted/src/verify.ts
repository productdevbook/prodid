import { planDiscovery, txtName } from '@prodid/core'

import type { TxtLookup } from './dns'
import { siteHost } from './names'
import type { Site } from './sites'

export type VerifyOutcome =
	| { state: 'verified'; domain: string }
	| { state: 'not-delegated'; domain: string; reason: string }
	| { state: 'lookup-failed'; domain: string; reason: string }
	| { state: 'no-domain' }

/**
 * Looks at the domain's `_prodid` record the way the crawler will. A failed lookup changes nothing,
 * in either direction: it neither grants a domain nor takes one away on the strength of a timeout.
 */
export async function verifySite(
	site: Site,
	zone: string,
	lookup: (name: string) => Promise<TxtLookup>,
	now: Date,
): Promise<{ site: Site; outcome: VerifyOutcome }> {
	const domain = site.domain
	if (domain === undefined) return { site: unverified(site), outcome: { state: 'no-domain' } }
	const name = txtName(domain)
	if (name === null) return { site: unverified(site), outcome: { state: 'not-delegated', domain, reason: 'bad-domain' } }

	const answer = await lookup(name)
	if (!answer.ok) return { site, outcome: { state: 'lookup-failed', domain, reason: answer.reason } }

	const planned = planDiscovery(domain, answer.records)
	if (!planned.ok) return { site: unverified(site), outcome: { state: 'not-delegated', domain, reason: planned.reason } }
	const host = siteHost(site.slug, zone)
	if (planned.plan.via !== 'dns-txt') return { site: unverified(site), outcome: { state: 'not-delegated', domain, reason: 'no-record' } }
	if (planned.plan.host !== host) {
		return { site: unverified(site), outcome: { state: 'not-delegated', domain, reason: `record names ${planned.plan.host}` } }
	}
	const verifiedAt = site.verified === domain && site.verifiedAt !== undefined ? site.verifiedAt : now.toISOString()
	return { site: { ...site, verified: domain, verifiedAt }, outcome: { state: 'verified', domain } }
}

function unverified(site: Site): Site {
	const { verified: _verified, verifiedAt: _verifiedAt, ...rest } = site
	return rest
}

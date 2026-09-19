import { getDomain, getPublicSuffix } from 'tldts'

import { normalizeDomain } from './discovery'

export interface SuffixOptions {
	/**
	 * Apply the Public Suffix List's private section, so a delegated suffix such as `github.io`
	 * counts as public and `a.github.io` becomes registrable on its own. Off by default: the coarser
	 * ICANN-only answer is the safer bucket for a rate limit.
	 */
	privateSuffixes?: boolean
}

/** The registrable domain (eTLD+1), or null when the input is not a domain or is a suffix itself. */
export function registrableDomain(domain: string, options: SuffixOptions = {}): string | null {
	const host = normalizeDomain(domain)
	return host === null ? null : getDomain(host, settings(options))
}

/** The public suffix the domain sits under, or null when the input is not a domain. */
export function publicSuffix(domain: string, options: SuffixOptions = {}): string | null {
	const host = normalizeDomain(domain)
	return host === null ? null : getPublicSuffix(host, settings(options))
}

function settings(options: SuffixOptions): {
	allowPrivateDomains: boolean
	detectIp: false
	extractHostname: false
	validateHostname: false
} {
	return {
		allowPrivateDomains: options.privateSuffixes ?? false,
		detectIp: false,
		extractHostname: false,
		validateHostname: false,
	}
}

/**
 * A slug is a DNS label and a source name at once, so the grammar is the intersection of what DNS
 * allows, what reads back unambiguously off a printed QR code, and what can never be mistaken for
 * ours. Three to thirty-two characters of lowercase ASCII letters, digits and hyphens, never at
 * either end. Lowercase because software writes it and because the source name it becomes must be
 * one name, not two; three at the least because a one- or two-character label is a land grab over a
 * namespace nobody can get back; thirty-two because it sits inside DNS's 63 and stays readable.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

/**
 * RFC 5890 reserves every label with `--` in the third and fourth characters, punycode's `xn--`
 * among them. A hosted name is ASCII, so a U-label has no business here and its A-label would be a
 * look-alike of whatever it decodes to.
 */
const RESERVED_LDH = /^..--/

/** A feed's public name. The same closed alphabet, plus the one extension the format has. */
const FEED_NAME = /^[a-z0-9][a-z0-9-]{0,62}\.ndjson$/

/**
 * Names that belong to us, to infrastructure, or to a convention a reader would trust. Digits at
 * the end are stripped before this is consulted, so `ns1`, `mail2` and `www3` are covered by their
 * stems and a pattern per family is not needed.
 */
const RESERVED = new Set([
	// prodid's own routes and services
	'www',
	'media',
	'api',
	'admin',
	'static',
	'status',
	'docs',
	'doc',
	'spec',
	'schema',
	'schemas',
	'id',
	'ids',
	'ping',
	'source',
	'sources',
	'ops',
	'operator',
	'publish',
	'registry',
	'index',
	// anything a reader would read as an account or a control surface
	'account',
	'accounts',
	'app',
	'apps',
	'auth',
	'billing',
	'console',
	'dashboard',
	'login',
	'logout',
	'my',
	'pay',
	'payment',
	'payments',
	'portal',
	'register',
	'root',
	'secure',
	'signin',
	'signup',
	'sso',
	'system',
	'user',
	'users',
	'verify',
	// mail and DNS, where a look-alike is a phishing or a delegation problem
	'mail',
	'email',
	'mx',
	'smtp',
	'imap',
	'pop',
	'ns',
	'dns',
	'doh',
	'whois',
	'dmarc',
	'dkim',
	'spf',
	'autodiscover',
	'autoconfig',
	'postmaster',
	'hostmaster',
	'webmaster',
	'abuse',
	'noreply',
	'no-reply',
	// operations, where a name suggests it is not a publisher at all
	'cdn',
	'edge',
	'origin',
	'assets',
	'img',
	'image',
	'images',
	'files',
	'file',
	'download',
	'downloads',
	'upload',
	'uploads',
	'storage',
	'bucket',
	'backup',
	'db',
	'sql',
	'cache',
	'queue',
	'worker',
	'workers',
	'proxy',
	'gateway',
	'router',
	'vpn',
	'ssh',
	'ftp',
	'sftp',
	'localhost',
	'internal',
	'intranet',
	'private',
	'public',
	'health',
	'healthz',
	'metrics',
	'monitor',
	'monitoring',
	'log',
	'logs',
	'grafana',
	'prometheus',
	// environments, which a reader takes as ours rather than a publisher's
	'dev',
	'development',
	'stage',
	'staging',
	'test',
	'testing',
	'sandbox',
	'preview',
	'beta',
	'alpha',
	'demo',
	'example',
	// pages we may serve ourselves one day, and legal surfaces
	'about',
	'blog',
	'help',
	'legal',
	'news',
	'press',
	'privacy',
	'security',
	'support',
	'terms',
	'contact',
])

/** The brand a hosted name must never be able to impersonate, after folding. */
const OURS = 'prodid'

/**
 * Characters a reader confuses with each other in a sans-serif label. Folding both sides of every
 * comparison means `adm1n` is `admin` and `pr0d-id` is `prodid`, so a reserved name cannot be
 * bought back one glyph at a time.
 */
const CONFUSABLE: Record<string, string> = {
	'0': 'o',
	'1': 'i',
	'2': 'z',
	'3': 'e',
	'4': 'a',
	'5': 's',
	'6': 'g',
	'7': 't',
	'8': 'b',
	'9': 'g',
	l: 'i',
}

function fold(slug: string): string {
	let folded = ''
	for (const character of slug) {
		if (character === '-') continue
		folded += CONFUSABLE[character] ?? character
	}
	return folded
}

const FOLDED_RESERVED = new Set([...RESERVED].map(fold))

export type SlugRejection = 'grammar' | 'reserved-ldh' | 'reserved'

export type SlugResult = { ok: true; slug: string } | { ok: false; reason: SlugRejection }

/**
 * Whether a name may be allocated and served. The check runs on the exact bytes: an uppercase
 * letter, a dot, a slash, a percent sign, a NUL or anything outside ASCII fails the grammar before
 * anything else looks at it, which is what keeps a slug from ever becoming part of another slug's
 * key or of a second DNS label.
 */
export function checkSlug(slug: string): SlugResult {
	if (!SLUG.test(slug)) return { ok: false, reason: 'grammar' }
	if (RESERVED_LDH.test(slug)) return { ok: false, reason: 'reserved-ldh' }

	const folded = fold(slug)
	if (folded.includes(OURS)) return { ok: false, reason: 'reserved' }
	const stem = slug.replace(/[0-9]+$/, '')
	if (RESERVED.has(slug) || RESERVED.has(stem) || FOLDED_RESERVED.has(folded) || FOLDED_RESERVED.has(fold(stem))) {
		return { ok: false, reason: 'reserved' }
	}
	return { ok: true, slug }
}

export function isSlug(slug: string): boolean {
	return checkSlug(slug).ok
}

export function isFeedName(name: string): boolean {
	return FEED_NAME.test(name) && !RESERVED_LDH.test(name)
}

export type Target = { kind: 'site'; slug: string; host: string } | { kind: 'operator' } | { kind: 'none' }

/**
 * DNS is case-insensitive and may be written with one trailing root dot, so neither costs a
 * publisher its catalogue; a port never appears in a name we serve, so one is refused rather than
 * ignored. Everything after that must be exactly one allocatable label under the hosting zone.
 */
export function resolveHost(host: string | null, zone: string, operatorHost: string): Target {
	if (host === null) return { kind: 'none' }
	if (host.includes(':')) return { kind: 'none' }
	const name = host.toLowerCase().replace(/\.$/, '')
	if (name === '') return { kind: 'none' }
	if (name === operatorHost.toLowerCase()) return { kind: 'operator' }

	const suffix = `.${zone.toLowerCase()}`
	if (!name.endsWith(suffix)) return { kind: 'none' }
	const label = name.slice(0, -suffix.length)
	return isSlug(label) ? { kind: 'site', slug: label, host: name } : { kind: 'none' }
}

/** The host a slug is served on, which is also what a delegating `_prodid` record must name. */
export function siteHost(slug: string, zone: string): string {
	return `${slug}.${zone}`
}

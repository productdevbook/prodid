import { canonicalize, sha256Hex } from '@prodid/core'

import { type ProblemBody, renderProblem } from './render'

export const PROBLEM_BASE = 'https://prodid.org/problem/'

export type ProblemType =
	| 'unknown-opid'
	| 'unknown-gtin'
	| 'invalid-gtin'
	| 'restricted-gtin'
	| 'unknown-source'
	| 'invalid-request'
	| 'rate-limited'
	| 'not-found'

/** The spec's problem table: one status per type, and only these two may ever be cached. */
const PROBLEMS: Record<ProblemType, { title: string; status: number }> = {
	'unknown-opid': { title: 'No entity with that opid', status: 404 },
	'unknown-gtin': { title: 'No entity with that GTIN', status: 404 },
	'restricted-gtin': { title: 'A restricted circulation number identifies nothing globally', status: 404 },
	'unknown-source': { title: 'No source with that name', status: 404 },
	'not-found': { title: 'Not found', status: 404 },
	'invalid-gtin': { title: 'Not a GTIN', status: 400 },
	'invalid-request': { title: 'Malformed request', status: 400 },
	'rate-limited': { title: 'Over the request budget', status: 429 },
}

const CACHEABLE = new Set<ProblemType>(['invalid-gtin', 'restricted-gtin'])

export type Variant = 'json' | 'html'

/**
 * JSON when the request accepts it at least as well as HTML. A browser sends `text/html` at q=1 and
 * `*\/*` at q=0.8, so it gets the page; anything asking for `*\/*` alone is a client, and gets JSON.
 */
export function chooseVariant(accept: string | null): Variant {
	if (accept === null || accept.trim() === '') return 'json'
	const json = quality(accept, 'application', 'json')
	const html = quality(accept, 'text', 'html')
	if (json === 0 && html === 0) return 'json'
	return json >= html ? 'json' : 'html'
}

function quality(accept: string, type: string, subtype: string): number {
	let best = 0
	let bestScore = -1
	for (const part of accept.split(',')) {
		const [range, ...parameters] = part.split(';')
		const media = (range ?? '').trim().toLowerCase()
		if (media === '') continue
		const [rangeType, rangeSubtype] = media.split('/')
		let score: number
		if (rangeType === type && rangeSubtype === subtype) score = 3
		else if (rangeType === type && rangeSubtype === '*') score = 2
		else if (rangeType === '*' && rangeSubtype === '*') score = 1
		else continue
		let q = 1
		for (const parameter of parameters) {
			const [name, value] = parameter.split('=')
			if ((name ?? '').trim().toLowerCase() === 'q') q = Number.parseFloat((value ?? '').trim()) || 0
		}
		if (score > bestScore) {
			bestScore = score
			best = q
		}
	}
	return best
}

export interface RespondOptions {
	status?: number
	cacheControl: string
	headers?: Record<string, string>
}

/**
 * One body, two representations, one validator. The ETag covers the representation, so a client that
 * switches between JSON and HTML never gets a stale 304, and `Vary: Accept` says so to the cache.
 */
export async function respond(request: Request, json: unknown, html: () => string, options: RespondOptions): Promise<Response> {
	const variant = chooseVariant(request.headers.get('accept'))
	const body = variant === 'json' ? `${JSON.stringify(json)}\n` : html()
	const etag = `"${(await sha256Hex(`${variant}:${canonicalize(json)}`)).slice(0, 32)}"`

	const headers = new Headers({
		'content-type': variant === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
		'cache-control': options.cacheControl,
		vary: 'Accept',
		etag,
		...options.headers,
	})

	if (matchesEtag(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers })
	}
	return new Response(body, { status: options.status ?? 200, headers })
}

export function problemResponse(request: Request, type: ProblemType, detail?: string, extra?: Record<string, string>): Response {
	const { title, status } = PROBLEMS[type]
	const body: ProblemBody = { type: `${PROBLEM_BASE}${type}`, title, status }
	if (detail !== undefined) body.detail = detail
	const variant = chooseVariant(request.headers.get('accept'))
	const headers = new Headers({
		'content-type': variant === 'json' ? 'application/problem+json; charset=utf-8' : 'text/html; charset=utf-8',
		vary: 'Accept',
		// Only what the request alone decides may be cached: a 404 today is the answer for an opid
		// or a domain that may exist tomorrow.
		'cache-control': CACHEABLE.has(type) ? 'public, max-age=86400' : 'no-store',
		...extra,
	})
	return new Response(variant === 'json' ? `${JSON.stringify(body)}\n` : renderProblem(body), { status, headers })
}

function matchesEtag(header: string | null, etag: string): boolean {
	if (header === null) return false
	return header
		.split(',')
		.map((candidate) => candidate.trim())
		.some((candidate) => candidate === '*' || candidate === etag || candidate === `W/${etag}`)
}

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

const TITLES: Record<ProblemType, string> = {
	'unknown-opid': 'No entity with that opid',
	'unknown-gtin': 'No entity with that GTIN',
	'invalid-gtin': 'Not a GTIN',
	'restricted-gtin': 'A restricted circulation number identifies nothing globally',
	'unknown-source': 'No source with that name',
	'invalid-request': 'Malformed request',
	'rate-limited': 'Over the request budget',
	'not-found': 'Not found',
}

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

export function problemResponse(
	request: Request,
	type: ProblemType,
	status: number,
	detail?: string,
	extra?: Record<string, string>,
): Response {
	const body: ProblemBody = { type: `${PROBLEM_BASE}${type}`, title: TITLES[type], status }
	if (detail !== undefined) body.detail = detail
	const variant = chooseVariant(request.headers.get('accept'))
	const headers = new Headers({
		'content-type': variant === 'json' ? 'application/problem+json; charset=utf-8' : 'text/html; charset=utf-8',
		vary: 'Accept',
		// A problem is about this request and this moment: an unknown opid may be minted a second later.
		'cache-control': cacheForProblem(type),
		...extra,
	})
	return new Response(variant === 'json' ? `${JSON.stringify(body)}\n` : renderProblem(body), { status, headers })
}

function cacheForProblem(type: ProblemType): string {
	// These two are decided by the request alone and can never change answer.
	if (type === 'invalid-gtin' || type === 'restricted-gtin') return 'public, max-age=86400'
	return 'no-store'
}

function matchesEtag(header: string | null, etag: string): boolean {
	if (header === null) return false
	return header
		.split(',')
		.map((candidate) => candidate.trim())
		.some((candidate) => candidate === '*' || candidate === etag || candidate === `W/${etag}`)
}

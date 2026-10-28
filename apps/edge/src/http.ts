import { canonicalize, ifNoneMatch, problem, type ProblemDocument, type ProblemType, sha256Hex } from '@prodid/core'

import { renderProblem } from './render'

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

	if (ifNoneMatch(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers })
	}
	return new Response(body, { status: options.status ?? 200, headers })
}

export function problemResponse(request: Request, type: Exclude<ProblemType, 'rate-limited'>, detail?: string): Response {
	return problemAnswer(request, problem(type, detail === undefined ? {} : { detail }))
}

export function rateLimitedResponse(request: Request, retryAfterSeconds: number): Response {
	return problemAnswer(request, problem('rate-limited', { retryAfterSeconds }))
}

function problemAnswer(request: Request, document: ProblemDocument): Response {
	const variant = chooseVariant(request.headers.get('accept'))
	const headers = new Headers({ ...document.headers, vary: 'Accept' })
	if (variant === 'html') headers.set('content-type', 'text/html; charset=utf-8')
	const body = variant === 'json' ? `${JSON.stringify(document.body)}\n` : renderProblem(document.body)
	return new Response(body, { status: document.status, headers })
}

import { canonicalize, ifNoneMatch, problem, type ProblemDocument, type ProblemType, sha256Hex } from '@prodid/core'

import { chooseLocale, type Locale } from './i18n'
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
 * switches between JSON and HTML never gets a stale 304, and `Vary: Accept` says so to the cache. A
 * page also differs by language, so its ETag names the language and its `Vary` names the header
 * whenever the header, not the URL, chose it.
 */
export async function respond(
	request: Request,
	json: unknown,
	html: (locale: Locale) => string,
	options: RespondOptions,
): Promise<Response> {
	const variant = chooseVariant(request.headers.get('accept'))
	const locale = variant === 'html' ? chooseLocale(request) : null
	const body = locale === null ? `${JSON.stringify(json)}\n` : html(locale)
	const etag = `"${(await sha256Hex(`${locale === null ? 'json' : `html:${locale.lang}`}:${canonicalize(json)}`)).slice(0, 32)}"`

	const headers = new Headers({
		'content-type': variant === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
		'cache-control': options.cacheControl,
		vary: 'Accept',
		etag,
		...options.headers,
	})
	if (locale !== null) languageHeaders(headers, locale)

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
	if (variant === 'json') return new Response(`${JSON.stringify(document.body)}\n`, { status: document.status, headers })
	const locale = chooseLocale(request)
	headers.set('content-type', 'text/html; charset=utf-8')
	languageHeaders(headers, locale)
	return new Response(renderProblem(document.body, locale), { status: document.status, headers })
}

function languageHeaders(headers: Headers, locale: Locale): void {
	headers.set('content-language', locale.lang)
	if (!locale.fromQuery) headers.set('vary', 'Accept, Accept-Language')
}

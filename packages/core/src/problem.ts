export const PROBLEM_BASE = 'https://prodid.org/problem/'

/** A problem detail longer than this is cut: a caller's own input is never echoed back unbounded. */
export const MAX_PROBLEM_DETAIL = 200

/** What a problem decided by the request alone may be cached for. Everything else is `no-store`. */
export const PROBLEM_MAX_AGE = 86_400

/**
 * The spec's problem table, which both Workers answer from so a `404` on `prodid.org` and one on a
 * hosted slug can never differ — two tables would drift, and the difference would be a fingerprint.
 *
 * `cacheable` is true only where the request alone decides the answer, so the same path will always
 * answer the same way. A `404` for an `opid` or a domain that may exist tomorrow is not one of them.
 */
const TABLE = {
	'unknown-opid': { status: 404, title: 'No entity with that opid', retryAfter: false, cacheable: false },
	'unknown-gtin': { status: 404, title: 'No entity with that GTIN', retryAfter: false, cacheable: false },
	'restricted-gtin': {
		status: 404,
		title: 'A restricted circulation number identifies nothing globally',
		retryAfter: false,
		cacheable: true,
	},
	'unknown-source': { status: 404, title: 'No source with that name', retryAfter: false, cacheable: false },
	'not-found': { status: 404, title: 'Not found', retryAfter: false, cacheable: false },
	'invalid-gtin': { status: 400, title: 'Not a GTIN', retryAfter: false, cacheable: true },
	'invalid-request': { status: 400, title: 'Malformed request', retryAfter: false, cacheable: false },
	'blocked-media': { status: 410, title: 'This file has been taken down', retryAfter: false, cacheable: true },
	'rate-limited': { status: 429, title: 'Over the request budget', retryAfter: true, cacheable: false },
} as const

export type ProblemType = keyof typeof TABLE

export interface ProblemSpec {
	status: number
	title: string
	/** Whether the type carries `Retry-After`. Only `rate-limited` does. */
	retryAfter: boolean
	/** Whether the request alone decides the answer, and so whether it may be cached. */
	cacheable: boolean
}

export const PROBLEMS: Readonly<Record<ProblemType, ProblemSpec>> = TABLE

/** The types that carry `Retry-After`, read off the table so the two cannot disagree. */
type Retrying = { [K in ProblemType]: (typeof TABLE)[K]['retryAfter'] extends true ? K : never }[ProblemType]

/** RFC 9457 members. `type` is the full URI; the rest are exactly what the spec's example shows. */
export interface ProblemBody {
	type: string
	title: string
	status: number
	detail?: string
	instance?: string
}

export interface ProblemDocument {
	status: number
	headers: Record<string, string>
	body: ProblemBody
}

interface ProblemOptions {
	/** Cut to `MAX_PROBLEM_DETAIL` characters, and dropped when it is blank. */
	detail?: string
	instance?: string
}

/**
 * `Retry-After` is required for a type that carries it and rejected for one that does not, so a
 * response cannot leave here disagreeing with the table.
 */
type ProblemArgs<T extends ProblemType> = T extends Retrying
	? [options: ProblemOptions & { retryAfterSeconds: number }]
	: [options?: ProblemOptions & { retryAfterSeconds?: never }]

/**
 * The status, headers and RFC 9457 body for one problem. No `Response` is built here: the two
 * Workers construct their own, and the parts that must match between them are all in this result.
 * `Vary` belongs to whichever of them negotiates a representation, so it is not set.
 */
export function problem<T extends ProblemType>(type: T, ...args: ProblemArgs<T>): ProblemDocument {
	const spec = PROBLEMS[type]
	const options: (ProblemOptions & { retryAfterSeconds?: number }) | undefined = args[0]

	const body: ProblemBody = { type: `${PROBLEM_BASE}${type}`, title: spec.title, status: spec.status }
	const detail = options?.detail?.trim().slice(0, MAX_PROBLEM_DETAIL)
	if (detail !== undefined && detail !== '') body.detail = detail
	if (options?.instance !== undefined && options.instance !== '') body.instance = options.instance

	const headers: Record<string, string> = {
		'content-type': 'application/problem+json; charset=utf-8',
		'cache-control': spec.cacheable ? `public, max-age=${PROBLEM_MAX_AGE}` : 'no-store',
	}
	if (spec.retryAfter) {
		const seconds = options?.retryAfterSeconds
		if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
			throw new RangeError(`${type} carries Retry-After, which needs a number of seconds`)
		}
		headers['retry-after'] = String(Math.ceil(seconds))
	}
	return { status: spec.status, headers, body }
}

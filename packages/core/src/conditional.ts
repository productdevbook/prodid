const ENTITY_TAG = /^"[!#-~\u0080-ÿ]*"$/

export interface ConditionalRequest {
	ifNoneMatch?: string | null
	ifModifiedSince?: string | null
}

export interface Validators {
	etag?: string | null
	lastModified?: Date | null
}

/**
 * RFC 9110 weak comparison: two entity tags match when their opaque tags are identical, whether or
 * not either is marked weak. `If-None-Match` is defined to use this, so `W/"x"` and `"x"` match.
 */
export function etagMatches(candidate: string, etag: string): boolean {
	const left = opaqueTag(candidate)
	const right = opaqueTag(etag)
	return left !== null && right !== null && left === right
}

/**
 * Whether an `If-None-Match` header names the representation being served, and so whether the
 * answer is `304`. `*` names any representation that exists.
 */
export function ifNoneMatch(header: string | null | undefined, etag: string | null | undefined): boolean {
	if (header === null || header === undefined || header.trim() === '') return false
	if (etag === null || etag === undefined) return false
	return header
		.split(',')
		.map((candidate) => candidate.trim())
		.some((candidate) => candidate === '*' || etagMatches(candidate, etag))
}

/**
 * Whether an `If-Modified-Since` header says the representation is unchanged. HTTP dates carry
 * whole seconds, so the comparison drops anything finer before deciding.
 */
export function ifModifiedSince(header: string | null | undefined, lastModified: Date | null | undefined): boolean {
	if (header === null || header === undefined || header.trim() === '') return false
	if (lastModified === null || lastModified === undefined) return false
	const since = Date.parse(header)
	if (Number.isNaN(since)) return false
	const modified = lastModified.getTime()
	if (Number.isNaN(modified)) return false
	return Math.floor(modified / 1000) <= Math.floor(since / 1000)
}

/**
 * Whether to answer `304`. `If-None-Match` decides on its own when it is present: RFC 9110 has a
 * recipient ignore `If-Modified-Since` then, because the entity tag is the better validator.
 */
export function isNotModified(request: ConditionalRequest, validators: Validators): boolean {
	const header = request.ifNoneMatch
	if (header !== null && header !== undefined && header.trim() !== '') return ifNoneMatch(header, validators.etag)
	return ifModifiedSince(request.ifModifiedSince, validators.lastModified)
}

function opaqueTag(tag: string): string | null {
	const trimmed = tag.trim()
	const bare = trimmed.startsWith('W/') ? trimmed.slice(2) : trimmed
	return ENTITY_TAG.test(bare) ? bare : null
}

import type { TxtRecord } from '@prodid/core'

/** Why a lookup told the crawler nothing. Every one of these is a transport failure, never a negative. */
export type LookupFailure = 'timeout' | 'servfail' | 'refused' | 'error'

/** An empty `records` is an answer: the name exists and carries no TXT, or does not exist at all. */
export type TxtLookup = { ok: true; records: TxtRecord[] } | { ok: false; reason: LookupFailure }

export type AddressLookup = { ok: true; addresses: string[] } | { ok: false; reason: LookupFailure }

export interface NetworkRequest {
	url: string
	headers: Record<string, string>
	signal: AbortSignal
}

export interface NetworkResponse {
	status: number
	headers: Headers
	body: ReadableStream<Uint8Array> | null
}

/**
 * Everything the crawler is allowed to touch outside this Worker. One interface, one implementation
 * in production and one scriptable fake in tests, so the whole pipeline runs with no network at all.
 */
export interface Network {
	resolveTxt(name: string, timeoutMs: number): Promise<TxtLookup>
	/** The A and AAAA records of a name. The crawler refuses to fetch a name that reaches nothing public. */
	resolveAddresses(host: string, timeoutMs: number): Promise<AddressLookup>
	fetch(request: NetworkRequest): Promise<NetworkResponse>
}

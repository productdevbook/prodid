import { decodeTxtPresentation, type TxtRecord } from '@prodid/core'

import type { AddressLookup, LookupFailure, Network, NetworkRequest, NetworkResponse, TxtLookup } from './types'

const TYPE = { A: 1, TXT: 16, AAAA: 28 } as const

interface DohAnswer {
	name: string
	type: number
	data: string
}

interface DohBody {
	Status: number
	Answer?: DohAnswer[]
}

type DohResult = { ok: true; answers: DohAnswer[] } | { ok: false; reason: LookupFailure }

/** DNS over HTTPS and `fetch`. The only thing in this Worker that talks to anyone else. */
export class LiveNetwork implements Network {
	constructor(private readonly endpoint: string) {}

	async resolveTxt(name: string, timeoutMs: number): Promise<TxtLookup> {
		const answer = await this.query(name, TYPE.TXT, timeoutMs)
		if (!answer.ok) return answer
		const records: TxtRecord[] = []
		for (const entry of answer.answers) {
			if (entry.type !== TYPE.TXT) continue
			// A DoH JSON answer is RFC 1035 presentation format; core turns it back into the
			// character-strings the record was published as.
			records.push(decodeTxtPresentation(entry.data) ?? entry.data)
		}
		return { ok: true, records }
	}

	async resolveAddresses(host: string, timeoutMs: number): Promise<AddressLookup> {
		const [v4, v6] = await Promise.all([this.query(host, TYPE.A, timeoutMs), this.query(host, TYPE.AAAA, timeoutMs)])
		if (!v4.ok && !v6.ok) return v4
		const addresses: string[] = []
		for (const answer of [v4, v6]) {
			if (!answer.ok) continue
			for (const entry of answer.answers) {
				if (entry.type === TYPE.A || entry.type === TYPE.AAAA) addresses.push(entry.data)
			}
		}
		return { ok: true, addresses }
	}

	async fetch(request: NetworkRequest): Promise<NetworkResponse> {
		const response = await fetch(request.url, {
			method: 'GET',
			headers: request.headers,
			redirect: 'manual',
			signal: request.signal,
		})
		return { status: response.status, headers: response.headers, body: response.body }
	}

	private async query(name: string, type: number, timeoutMs: number): Promise<DohResult> {
		const url = `${this.endpoint}?name=${encodeURIComponent(name)}&type=${type}`
		let response: Response
		try {
			response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(timeoutMs) })
		} catch (error) {
			return { ok: false, reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'error' }
		}
		if (!response.ok) return { ok: false, reason: 'error' }
		let body: DohBody
		try {
			body = (await response.json()) as DohBody
		} catch {
			return { ok: false, reason: 'error' }
		}
		// NXDOMAIN and NODATA are answers: the name publishes nothing. SERVFAIL and REFUSED are not.
		if (body.Status === 2) return { ok: false, reason: 'servfail' }
		if (body.Status === 5) return { ok: false, reason: 'refused' }
		if (body.Status !== 0 && body.Status !== 3) return { ok: false, reason: 'error' }
		return { ok: true, answers: body.Answer ?? [] }
	}
}

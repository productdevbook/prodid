import { decodeTxtPresentation, type TxtRecord } from '@prodid/core'

export type TxtLookup = { ok: true; records: TxtRecord[] } | { ok: false; reason: 'timeout' | 'servfail' | 'refused' | 'error' }

const TXT = 16
const TIMEOUT_MS = 5_000

interface DohBody {
	Status: number
	Answer?: { type: number; data: string }[]
}

export async function resolveTxt(endpoint: string, name: string): Promise<TxtLookup> {
	let response: Response
	try {
		response = await fetch(`${endpoint}?name=${encodeURIComponent(name)}&type=${TXT}`, {
			headers: { accept: 'application/dns-json' },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
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
	const records: TxtRecord[] = []
	for (const answer of body.Answer ?? []) {
		if (answer.type === TXT) records.push(decodeTxtPresentation(answer.data) ?? answer.data)
	}
	return { ok: true, records }
}

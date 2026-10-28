import type { FeedPublisher } from '@prodid/core'

export interface SiteSettings {
	publisher: FeedPublisher
	license: string
	domain?: string
}

export class OperatorError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown,
	) {
		super(`operator endpoint answered ${status}: ${describe(body)}`)
	}
}

/** The hosted publisher's operator endpoint. Everything it does is an HTTP call there. */
export class OperatorClient {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
		private readonly send: (request: Request) => Promise<Response> = (request) => fetch(request),
	) {}

	showSite(slug: string): Promise<unknown> {
		return this.call('GET', `/sites/${encodeURIComponent(slug)}`)
	}

	putSite(slug: string, settings: SiteSettings): Promise<unknown> {
		return this.call('PUT', `/sites/${encodeURIComponent(slug)}`, JSON.stringify(settings), 'application/json')
	}

	removeSite(slug: string): Promise<unknown> {
		return this.call('DELETE', `/sites/${encodeURIComponent(slug)}`)
	}

	putFeed(slug: string, name: string, ndjson: string | Uint8Array<ArrayBuffer>): Promise<unknown> {
		return this.call('PUT', `/sites/${encodeURIComponent(slug)}/feeds/${encodeURIComponent(name)}`, ndjson, 'application/x-ndjson')
	}

	removeFeed(slug: string, name: string): Promise<unknown> {
		return this.call('DELETE', `/sites/${encodeURIComponent(slug)}/feeds/${encodeURIComponent(name)}`)
	}

	verify(slug: string): Promise<unknown> {
		return this.call('POST', `/sites/${encodeURIComponent(slug)}/verify`)
	}

	private async call(method: string, path: string, body?: string | Uint8Array<ArrayBuffer>, contentType?: string): Promise<unknown> {
		const headers = new Headers({ authorization: `Bearer ${this.token}`, accept: 'application/json' })
		if (contentType !== undefined) headers.set('content-type', contentType)
		const request = new Request(new URL(path, this.baseUrl), { method, headers, ...(body === undefined ? {} : { body }) })
		const response = await this.send(request)
		const text = await response.text()
		const parsed: unknown = text === '' ? null : safeJson(text)
		if (!response.ok) throw new OperatorError(response.status, parsed)
		return parsed
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

function describe(body: unknown): string {
	if (body === null) return 'no body'
	return typeof body === 'string' ? body : JSON.stringify(body)
}

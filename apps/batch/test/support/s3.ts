/** Just enough of R2's S3 API for Bun's client: objects, multipart uploads, listing, deletion. */
export interface FakeBucket {
	url: string
	objects: Map<string, { body: Uint8Array<ArrayBuffer>; type: string | null }>
	/** Each key in the order its write completed. */
	completed: string[]
	deleted: string[]
	multipart: number
	failPut: ((key: string) => boolean) | null
	stop(): void
}

export function fakeBucket(name: string): FakeBucket {
	const uploads = new Map<string, { key: string; type: string | null; parts: Map<number, Uint8Array<ArrayBuffer>> }>()
	let next = 0
	const state: FakeBucket = {
		url: '',
		objects: new Map(),
		completed: [],
		deleted: [],
		multipart: 0,
		failPut: null,
		stop: () => server.stop(true),
	}
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const url = new URL(request.url)
			const path = decodeURIComponent(url.pathname)
			if (path === `/${name}` || path === `/${name}/`) {
				if (request.method !== 'GET') return new Response(null, { status: 405 })
				const prefix = url.searchParams.get('prefix') ?? ''
				const keys = [...state.objects.keys()].filter((key) => key.startsWith(prefix)).sort()
				const contents = keys.map((key) => `<Contents><Key>${key}</Key><Size>${state.objects.get(key)!.body.length}</Size></Contents>`)
				return xml(
					`<ListBucketResult><Name>${name}</Name><Prefix>${prefix}</Prefix><KeyCount>${keys.length}</KeyCount><IsTruncated>false</IsTruncated>${contents.join('')}</ListBucketResult>`,
				)
			}
			if (!path.startsWith(`/${name}/`)) return new Response(null, { status: 404 })
			const key = path.slice(name.length + 2)
			const uploadId = url.searchParams.get('uploadId')
			switch (request.method) {
				case 'HEAD':
				case 'GET': {
					const object = state.objects.get(key)
					if (object === undefined) return xml('<Error><Code>NoSuchKey</Code></Error>', 404)
					return new Response(request.method === 'HEAD' ? null : object.body, {
						headers: { 'content-length': String(object.body.length), etag: '"e"' },
					})
				}
				case 'PUT': {
					if (state.failPut?.(key) === true) return xml('<Error><Code>InternalError</Code></Error>', 500)
					const body = new Uint8Array(await request.arrayBuffer())
					if (uploadId !== null) {
						uploads.get(uploadId)!.parts.set(Number(url.searchParams.get('partNumber')), body)
						return new Response(null, { headers: { etag: `"part-${url.searchParams.get('partNumber')}"` } })
					}
					state.objects.set(key, { body, type: request.headers.get('content-type') })
					state.completed.push(key)
					return new Response(null, { headers: { etag: '"e"' } })
				}
				case 'POST': {
					if (url.searchParams.has('uploads')) {
						const id = `upload-${(next += 1)}`
						uploads.set(id, { key, type: request.headers.get('content-type'), parts: new Map() })
						return xml(
							`<InitiateMultipartUploadResult><Bucket>${name}</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
						)
					}
					const upload = uploadId === null ? undefined : uploads.get(uploadId)
					if (upload === undefined) return xml('<Error><Code>NoSuchUpload</Code></Error>', 404)
					const parts = [...upload.parts].sort(([a], [b]) => a - b).map(([, part]) => part)
					state.objects.set(key, { body: new Uint8Array(Buffer.concat(parts)), type: upload.type })
					state.completed.push(key)
					state.multipart += 1
					uploads.delete(uploadId!)
					return xml(`<CompleteMultipartUploadResult><Key>${key}</Key><ETag>"m"</ETag></CompleteMultipartUploadResult>`)
				}
				case 'DELETE':
					if (uploadId !== null) uploads.delete(uploadId)
					else {
						state.objects.delete(key)
						state.deleted.push(key)
					}
					return new Response(null, { status: 204 })
				default:
					return new Response(null, { status: 405 })
			}
		},
	})
	state.url = server.url.origin
	return state
}

function xml(body: string, status = 200): Response {
	return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { status, headers: { 'content-type': 'application/xml' } })
}

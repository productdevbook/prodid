/** What the media pipeline needs from a bucket. One interface, R2 behind it, a Map in tests. */
export interface StoredObject {
	body: ReadableStream<Uint8Array>
	size: number
	contentType: string | null
	etag: string
}

export interface PutOptions {
	contentType: string
	/** Files are immutable and named by their digest, so they are cached for as long as anyone will. */
	cacheControl: string
	/** What the file was fetched from, kept as provenance on the object as well as in the claim. */
	sourceUrl: string
}

export interface ObjectStore {
	head(key: string): Promise<{ size: number; contentType: string | null } | null>
	get(key: string): Promise<StoredObject | null>
	put(key: string, body: Uint8Array, options: PutOptions): Promise<void>
	delete(key: string): Promise<void>
}

export const IMMUTABLE = 'public, max-age=31536000, immutable'

/** The key a digest is stored under. `media.prodid.org/sha256/{hex}` serves exactly this. */
export function mediaKey(sha256: string): string {
	return `sha256/${sha256}`
}

export function r2Store(bucket: R2Bucket): ObjectStore {
	return {
		async head(key) {
			const found = await bucket.head(key)
			return found === null ? null : { size: found.size, contentType: found.httpMetadata?.contentType ?? null }
		},
		async get(key) {
			const found = await bucket.get(key)
			if (found === null) return null
			return {
				body: found.body as ReadableStream<Uint8Array>,
				size: found.size,
				contentType: found.httpMetadata?.contentType ?? null,
				etag: found.httpEtag,
			}
		},
		async put(key, body, options) {
			await bucket.put(key, body as unknown as ArrayBuffer, {
				httpMetadata: { contentType: options.contentType, cacheControl: options.cacheControl },
				customMetadata: { sourceUrl: options.sourceUrl },
			})
		},
		async delete(key) {
			await bucket.delete(key)
		},
	}
}

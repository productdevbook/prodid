import type { Blobs, StoredHead, StoredObject } from '../src/sites'

export class MemoryBlobs implements Blobs {
	readonly objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; uploaded: Date; etag: string; metadata: Record<string, string> }>()
	private version = 0

	async get(key: string): Promise<StoredObject | null> {
		const object = this.objects.get(key)
		if (object === undefined) return null
		return { body: new Blob([object.bytes]).stream(), etag: object.etag, uploaded: object.uploaded, size: object.bytes.byteLength }
	}

	async head(key: string): Promise<StoredHead | null> {
		const object = this.objects.get(key)
		return object === undefined ? null : { uploaded: object.uploaded, size: object.bytes.byteLength, metadata: object.metadata }
	}

	async text(key: string): Promise<string | null> {
		const object = this.objects.get(key)
		return object === undefined ? null : new TextDecoder().decode(object.bytes)
	}

	async put(key: string, body: ArrayBuffer | string, _contentType: string, metadata: Record<string, string> = {}): Promise<void> {
		const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body.slice(0))
		this.objects.set(key, {
			bytes: bytes as Uint8Array<ArrayBuffer>,
			uploaded: new Date('2026-10-01T00:00:00Z'),
			etag: `"v${++this.version}"`,
			metadata,
		})
	}

	async delete(keys: string[]): Promise<void> {
		for (const key of keys) this.objects.delete(key)
	}

	async slugs(): Promise<string[]> {
		const slugs = new Set<string>()
		for (const key of this.objects.keys()) slugs.add(key.split('/')[1] ?? '')
		return [...slugs]
	}
}

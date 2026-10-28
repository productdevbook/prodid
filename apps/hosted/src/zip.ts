export interface ZipEntry {
	name: string
	open(): Promise<{ body: ReadableStream<Uint8Array>; modified: Date } | null>
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
	let crc = index
	for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
	return crc >>> 0
})

function crc32(crc: number, bytes: Uint8Array): number {
	let value = crc ^ 0xffffffff
	for (let index = 0; index < bytes.length; index++) value = (CRC_TABLE[(value ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (value >>> 8)
	return (value ^ 0xffffffff) >>> 0
}

/** Data descriptor follows the data, names are UTF-8. */
const FLAGS = 0x0808
const VERSION = 20

function dosTime(date: Date): { time: number; date: number } {
	const year = Math.max(date.getUTCFullYear(), 1980)
	return {
		time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
		date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
	}
}

function record(size: number, fill: (view: DataView) => void): Uint8Array {
	const bytes = new Uint8Array(size)
	fill(new DataView(bytes.buffer))
	return bytes
}

/**
 * A zip of stored (uncompressed) entries, streamed: each entry is read once, its CRC taken on the
 * way through and written after it. Without zip64, so the whole archive stays under 4 GiB, which
 * 100 feeds of 32 MiB do.
 */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	async function* parts(): AsyncGenerator<Uint8Array> {
		const central: Uint8Array[] = []
		let offset = 0
		let count = 0
		for (const entry of entries) {
			const opened = await entry.open()
			if (opened === null) continue
			const name = encoder.encode(entry.name)
			const stamp = dosTime(opened.modified)
			const start = offset
			const local = record(30 + name.length, (view) => {
				view.setUint32(0, 0x04034b50, true)
				view.setUint16(4, VERSION, true)
				view.setUint16(6, FLAGS, true)
				view.setUint16(10, stamp.time, true)
				view.setUint16(12, stamp.date, true)
				view.setUint16(26, name.length, true)
			})
			local.set(name, 30)
			yield local
			offset += local.length

			let crc = 0
			let size = 0
			for await (const chunk of opened.body) {
				crc = crc32(crc, chunk)
				size += chunk.byteLength
				yield chunk
			}
			offset += size

			yield record(16, (view) => {
				view.setUint32(0, 0x08074b50, true)
				view.setUint32(4, crc, true)
				view.setUint32(8, size, true)
				view.setUint32(12, size, true)
			})
			offset += 16

			const header = record(46 + name.length, (view) => {
				view.setUint32(0, 0x02014b50, true)
				view.setUint16(4, VERSION, true)
				view.setUint16(6, VERSION, true)
				view.setUint16(8, FLAGS, true)
				view.setUint16(12, stamp.time, true)
				view.setUint16(14, stamp.date, true)
				view.setUint32(16, crc, true)
				view.setUint32(20, size, true)
				view.setUint32(24, size, true)
				view.setUint16(28, name.length, true)
				view.setUint32(42, start, true)
			})
			header.set(name, 46)
			central.push(header)
			count++
		}

		let directory = 0
		for (const header of central) {
			yield header
			directory += header.length
		}
		yield record(22, (view) => {
			view.setUint32(0, 0x06054b50, true)
			view.setUint16(8, count, true)
			view.setUint16(10, count, true)
			view.setUint32(12, directory, true)
			view.setUint32(16, offset, true)
		})
	}

	const iterator = parts()
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await iterator.next()
			if (done) controller.close()
			else controller.enqueue(value)
		},
		async cancel() {
			await iterator.return(undefined)
		},
	})
}

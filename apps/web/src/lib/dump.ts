export const DUMPS = 'https://dumps.prodid.org/v0/'
export const LATEST = `${DUMPS}latest.json`
export const DUMP_SCHEMA = 'https://prodid.org/schemas/v0/org.prodid.dump.json'

const FILE_NAMES = ['sources.ndjson.gz', 'entities.ndjson.gz', 'records.ndjson.gz', 'groupings.ndjson.gz', 'merges.ndjson.gz'] as const

export type DumpFileName = (typeof FILE_NAMES)[number]

export interface DumpFile {
	name: DumpFileName
	sha256: string
	bytes: number
	lines: number
	url: string
}

export interface LatestDump {
	snapshotAt: string
	createdAt: string
	date: string
	directory: string
	manifest: string
	files: DumpFile[]
	licenses: { index: string; claims: string }
}

class DumpManifestError extends Error {
	override name = 'DumpManifestError'
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

/** Read at build time: /data states the newest dump, and a page without one would say something untrue, so the build stops instead. */
export async function fetchLatestDump(): Promise<LatestDump> {
	let response: Response
	try {
		response = await fetch(LATEST, { headers: { accept: 'application/json' } })
	} catch (error) {
		throw new DumpManifestError(`/data could not fetch ${LATEST}: ${error instanceof Error ? error.message : String(error)}`)
	}
	if (!response.ok) throw new DumpManifestError(`/data could not fetch ${LATEST}: HTTP ${response.status}`)
	const body: unknown = await response.json()

	if (!isObject(body) || body.$type !== 'org.prodid.dump' || body.version !== 0) {
		throw new DumpManifestError(`${LATEST} is not a v0 org.prodid.dump manifest`)
	}
	const { snapshot_at: snapshotAt, created_at: createdAt, files, licenses } = body
	if (!isTime(snapshotAt) || !isTime(createdAt)) throw new DumpManifestError(`${LATEST} has no valid snapshot_at and created_at`)
	if (!isObject(licenses) || typeof licenses.index !== 'string' || typeof licenses.claims !== 'string') {
		throw new DumpManifestError(`${LATEST} has no valid licenses`)
	}
	if (!Array.isArray(files)) throw new DumpManifestError(`${LATEST} has no files`)

	const date = snapshotAt.slice(0, 10)
	const directory = `${DUMPS}${date}/`
	const listed = FILE_NAMES.map((name) => {
		const file: unknown = files.find((entry) => isObject(entry) && entry.name === name)
		if (
			!isObject(file) ||
			typeof file.sha256 !== 'string' ||
			!/^[0-9a-f]{64}$/.test(file.sha256) ||
			!isCount(file.bytes) ||
			!isCount(file.lines)
		) {
			throw new DumpManifestError(`${LATEST} does not describe ${name}`)
		}
		return { name, sha256: file.sha256, bytes: file.bytes, lines: file.lines, url: `${directory}${name}` }
	})

	return {
		snapshotAt,
		createdAt,
		date,
		directory,
		manifest: `${directory}manifest.json`,
		files: listed,
		licenses: { index: licenses.index, claims: licenses.claims },
	}
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const units = ['KiB', 'MiB', 'GiB', 'TiB']
	let value = bytes / 1024
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function formatUtc(time: string): string {
	return `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

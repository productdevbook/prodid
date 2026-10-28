import { mkdir, readdir, rename, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { type DumpFile, type DumpManifest, validateDump } from '@prodid/core'
import { createClient, DUMP_FILES, type DumpSnapshot, readSnapshot } from '@prodid/store'

export const DUMP_VERSION_PREFIX = 'v1/'
export const LATEST_KEY = `${DUMP_VERSION_PREFIX}latest.json`
/** Every version directory retention applies to: the v0 dumps written before v1 expire as they always did. */
export const RETAINED_PREFIXES = ['v0/', DUMP_VERSION_PREFIX] as const
export const DAILY_KEPT = 7
export const PART_BYTES = 16 * 1024 * 1024

const CHUNK_BYTES = 64 * 1024
const DATED = /^v\d+\/(\d{4}-\d{2}-\d{2})\//

export class DumpCommandError extends Error {}

/** Where a dump is written, addressed by the keys of the `prodid-dumps` bucket. */
export interface DumpTarget {
	readonly label: string
	exists(key: string): Promise<boolean>
	write(key: string, body: ReadableStream<Uint8Array>, type: string): Promise<void>
	list(prefix: string): Promise<string[]>
	delete(key: string): Promise<void>
}

const R2_NAMES = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_DUMPS_BUCKET'] as const

export type BucketEnv = Record<(typeof R2_NAMES)[number], string>

export function dumpDatabaseEnv(env: Record<string, string | undefined>): string {
	if (env.DATABASE_URL === undefined || env.DATABASE_URL === '') throw new DumpCommandError('DATABASE_URL is not set')
	return env.DATABASE_URL
}

export function bucketEnv(env: Record<string, string | undefined>): BucketEnv {
	const missing = R2_NAMES.filter((name) => env[name] === undefined || env[name] === '')
	if (missing.length > 0) throw new DumpCommandError(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set`)
	return Object.fromEntries(R2_NAMES.map((name) => [name, env[name]!])) as BucketEnv
}

export function bucketTarget(env: BucketEnv): DumpTarget {
	const bucket = new Bun.S3Client({
		endpoint: env.R2_ENDPOINT,
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		bucket: env.R2_DUMPS_BUCKET,
		region: 'auto',
	})
	return {
		label: `bucket ${env.R2_DUMPS_BUCKET}`,
		exists: (key) => bucket.exists(key),
		async write(key, body, type) {
			const writer = bucket.file(key).writer({ type, partSize: PART_BYTES })
			const reader = body.getReader()
			try {
				for (;;) {
					const chunk = await reader.read()
					if (chunk.done) break
					await writer.write(chunk.value)
				}
			} catch (error) {
				await writer.end(error instanceof Error ? error : new Error(String(error)))
				throw error
			}
			await writer.end()
		},
		async list(prefix) {
			const keys: string[] = []
			let continuationToken: string | undefined
			do {
				const page = await bucket.list(continuationToken === undefined ? { prefix } : { prefix, continuationToken })
				for (const entry of page.contents ?? []) keys.push(entry.key)
				continuationToken = page.isTruncated === true ? page.nextContinuationToken : undefined
			} while (continuationToken !== undefined)
			return keys
		},
		delete: (key) => bucket.delete(key),
	}
}

/** The bucket's layout under a local directory, each file renamed into place once complete. */
export function directoryTarget(root: string): DumpTarget {
	const base = resolve(root)
	return {
		label: `directory ${base}`,
		async exists(key) {
			return await stat(join(base, key)).then(
				() => true,
				() => false,
			)
		},
		async write(key, body) {
			const path = join(base, key)
			await mkdir(dirname(path), { recursive: true })
			const partial = `${path}.partial`
			const sink = Bun.file(partial).writer()
			const reader = body.getReader()
			try {
				for (;;) {
					const chunk = await reader.read()
					if (chunk.done) break
					await sink.write(chunk.value)
				}
				await sink.end()
			} catch (error) {
				await sink.end()
				await rm(partial, { force: true })
				throw error
			}
			await rename(partial, path)
		},
		async list(prefix) {
			const entries = await readdir(join(base, prefix), { recursive: true, withFileTypes: true }).catch(() => [])
			return entries
				.filter((entry) => entry.isFile())
				.map((entry) => join(entry.parentPath, entry.name).slice(base.length + 1))
				.sort()
		},
		async delete(key) {
			await rm(join(base, key), { force: true })
			await rmdir(dirname(join(base, key))).catch(() => {})
		},
	}
}

/** The dated dumps retention keeps: the last seven days up to `today`, and each month's first for good. */
export function keptDates(dates: readonly string[], today: string): Set<string> {
	const kept = new Set<string>()
	const firstOfMonth = new Map<string, string>()
	for (const date of [...dates].sort()) if (!firstOfMonth.has(date.slice(0, 7))) firstOfMonth.set(date.slice(0, 7), date)
	const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - (DAILY_KEPT - 1) * 86_400_000).toISOString().slice(0, 10)
	for (const date of dates) if (date >= cutoff || firstOfMonth.get(date.slice(0, 7)) === date) kept.add(date)
	return kept
}

export interface DumpRunOptions {
	log?: (line: string) => void
	page?: number
}

export interface DumpRun {
	manifest: DumpManifest
	directory: string
	removed: string[]
}

/**
 * Writes one dump from one snapshot: the five files, then the manifest, then `latest.json`, then
 * applies retention. A date whose manifest is already there is refused, since a kept dump is never
 * rewritten; a run that failed before its manifest leaves no manifest and can simply be repeated.
 */
export async function runDump(databaseUrl: string, target: DumpTarget, options: DumpRunOptions = {}): Promise<DumpRun> {
	const log = options.log ?? console.log
	const started = performance.now()
	log(`database: ${new URL(databaseUrl).host}`)
	log(`target: ${target.label}`)

	const sql = createClient(databaseUrl, { max: 2, onnotice: () => {} })
	try {
		const written = await readSnapshot(
			sql,
			async (snapshot) => {
				const date = snapshot.snapshotAt.toISOString().slice(0, 10)
				const directory = `${DUMP_VERSION_PREFIX}${date}/`
				if (await target.exists(`${directory}manifest.json`)) {
					throw new DumpCommandError(`${directory}manifest.json already exists; a written dump is never rewritten`)
				}
				log(`snapshot: ${snapshot.snapshotAt.toISOString()}`)
				const files: DumpFile[] = []
				for (const name of DUMP_FILES) {
					const fileStarted = performance.now()
					const file = await writeFile(target, `${directory}${name}`, lines(snapshot, name))
					files.push({ name, ...file })
					log(`${name}: ${file.lines} ${file.lines === 1 ? 'line' : 'lines'}, ${file.bytes} bytes, ${seconds(fileStarted)}`)
				}
				return { snapshotAt: snapshot.snapshotAt, directory, files }
			},
			options.page === undefined ? {} : { page: options.page },
		)

		const [clock] = await sql<{ at: Date }[]>`select clock_timestamp() as at`
		const manifest: DumpManifest = {
			$type: 'org.prodid.dump',
			version: 1,
			created_at: clock!.at.toISOString(),
			snapshot_at: written.snapshotAt.toISOString(),
			files: written.files,
			licenses: { index: 'CC0-1.0', claims: 'source' },
		}
		const valid = validateDump(manifest, { version: 1 })
		if (!valid.ok)
			throw new DumpCommandError(`the manifest does not validate: ${valid.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`)
		const body = `${JSON.stringify(manifest, null, '\t')}\n`
		await target.write(`${written.directory}manifest.json`, text(body), 'application/json')
		log(`manifest: ${written.directory}manifest.json`)
		await target.write(LATEST_KEY, text(body), 'application/json')
		log(`latest: ${LATEST_KEY}`)

		const removed = await applyRetention(target, manifest.snapshot_at.slice(0, 10))
		for (const directory of removed) log(`retention: removed ${directory}`)
		log(`done in ${seconds(started)}`)
		return { manifest, directory: written.directory, removed }
	} finally {
		await sql.end({ timeout: 5 })
	}
}

function lines(snapshot: DumpSnapshot, name: DumpFile['name']): AsyncGenerator<unknown> {
	switch (name) {
		case 'sources.ndjson.gz':
			return snapshot.sources()
		case 'entities.ndjson.gz':
			return snapshot.entities()
		case 'records.ndjson.gz':
			return snapshot.records()
		case 'groupings.ndjson.gz':
			return snapshot.groupings()
		case 'merges.ndjson.gz':
			return snapshot.merges()
	}
}

async function writeFile(target: DumpTarget, key: string, values: AsyncIterator<unknown>): Promise<Omit<DumpFile, 'name'>> {
	const encoder = new TextEncoder()
	const hasher = new Bun.CryptoHasher('sha256')
	let count = 0
	let bytes = 0
	const ndjson = new ReadableStream<BufferSource>({
		async pull(controller) {
			let chunk = ''
			while (chunk.length < CHUNK_BYTES) {
				const next = await values.next()
				if (next.done === true) {
					if (chunk !== '') controller.enqueue(encoder.encode(chunk))
					controller.close()
					return
				}
				count += 1
				chunk += `${JSON.stringify(next.value)}\n`
			}
			controller.enqueue(encoder.encode(chunk))
		},
	})
	const measured = ndjson.pipeThrough(new CompressionStream('gzip')).pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				hasher.update(chunk)
				bytes += chunk.byteLength
				controller.enqueue(chunk)
			},
		}),
	)
	await target.write(key, measured, 'application/gzip')
	return { sha256: hasher.digest('hex'), bytes, lines: count }
}

async function applyRetention(target: DumpTarget, today: string): Promise<string[]> {
	const removed: string[] = []
	for (const prefix of RETAINED_PREFIXES) removed.push(...(await applyRetentionUnder(target, prefix, today)))
	return removed
}

async function applyRetentionUnder(target: DumpTarget, prefix: string, today: string): Promise<string[]> {
	const keys = await target.list(prefix)
	const byDate = new Map<string, string[]>()
	for (const key of keys) {
		const date = DATED.exec(key)?.[1]
		if (date !== undefined) byDate.set(date, [...(byDate.get(date) ?? []), key])
	}
	const kept = keptDates([...byDate.keys()], today)
	const removed: string[] = []
	for (const [date, dated] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
		if (kept.has(date)) continue
		for (const key of dated) await target.delete(key)
		removed.push(`${prefix}${date}/`)
	}
	return removed
}

function text(value: string): ReadableStream<Uint8Array> {
	return new Response(value).body!
}

function seconds(since: number): string {
	return `${((performance.now() - since) / 1000).toFixed(1)} s`
}

import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { mapWikidataEntity, WIKIDATA_GTIN, wikidataBrandIds, wikidataEnglishLabel, type WikidataSkip } from '@prodid/core'
import {
	createClient,
	ensureDatasetSource,
	finishImport,
	importRecords,
	type ImportRun,
	type PreparedRecord,
	prepareRecord,
	type Sql,
	startImport,
	type WithdrawalResult,
} from '@prodid/store'

export const DATASETS = ['wikidata'] as const
export type Dataset = (typeof DATASETS)[number]

export const WIKIDATA_DUMP_URL = 'https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.gz'
export const WIKIDATA_LICENSE = 'CC0-1.0'
export const MAX_ENTITY_BYTES = 64 * 1024 * 1024
export const IMPORT_BATCH = 1000
export const PROGRESS_EVERY = 1_000_000
const DOWNLOAD_PROGRESS_BYTES = 1024 ** 3

export type ImportSkip = WikidataSkip | 'unreadable'
export const IMPORT_SKIPS: readonly ImportSkip[] = ['not-an-item', 'no-gtin', 'no-brand', 'no-label', 'invalid', 'unreadable']

export class ImportError extends Error {}

export interface ImportOptions {
	/** The export's public URL, recorded as the import's `document_url`. */
	documentUrl?: string
	log?: (line: string) => void
	progressEvery?: number
	batch?: number
}

export interface ImportResult {
	entities: number
	written: number
	changed: number
	skipped: Record<ImportSkip, number>
	dropped: number
	withdrawn: WithdrawalResult
	outcome: 'changed' | 'unchanged'
}

export function parseDataset(value: string): Dataset {
	if (!(DATASETS as readonly string[]).includes(value)) throw new ImportError(`unknown dataset ${value}; known: ${DATASETS.join(', ')}`)
	return value as Dataset
}

/**
 * A full import of a Wikidata JSON dump, plain, gzip or bzip2, from a local file or a URL, which is
 * downloaded to a temporary file first. The dump is streamed twice and never held: the first pass
 * keeps the entities that state a GTIN in a side file and the brand QIDs they name, the second
 * finds those brands' English labels wherever in the dump they are; then the side file is mapped
 * and written through the crawl's ingest, and what the import did not see is withdrawn.
 */
export async function runImport(
	databaseUrl: string,
	dataset: Dataset,
	location: string,
	options: ImportOptions = {},
): Promise<ImportResult> {
	const log = options.log ?? console.log
	const every = options.progressEvery ?? PROGRESS_EVERY
	const batchSize = options.batch ?? IMPORT_BATCH
	const started = performance.now()
	const remote = /^https?:\/\//i.test(location)
	const documentUrl = options.documentUrl ?? (remote ? location : WIKIDATA_DUMP_URL)
	if (!/^https:\/\//i.test(documentUrl) || !URL.canParse(documentUrl)) {
		throw new ImportError(`the export's document URL must be a public https URL: ${documentUrl}`)
	}

	log(`database: ${new URL(databaseUrl).host}`)
	log(`dataset: ${dataset}, export ${location}`)
	log(`document_url: ${documentUrl}`)

	const scratch = await mkdtemp(join(tmpdir(), 'prodid-import-'))
	const sql = createClient(databaseUrl, { max: 1, onnotice: () => {} })
	try {
		let path: string
		if (remote) {
			path = join(scratch, basename(new URL(location).pathname) || 'export')
			await download(location, path, log)
		} else {
			path = resolve(location)
			const found = await stat(path).catch(() => null)
			if (found === null || !found.isFile()) throw new ImportError(`${location} is not a file`)
		}

		const source = await ensureDatasetSource(sql, { slug: dataset, license: WIKIDATA_LICENSE, now: new Date() })
		const run = await startImport(sql, { source: source.id, documentUrl, startedAt: new Date() })

		const skipped = Object.fromEntries(IMPORT_SKIPS.map((skip) => [skip, 0])) as Record<ImportSkip, number>
		const candidates = join(scratch, 'candidates.ndjson')
		const wanted = new Set<string>()
		const entities = await collect(path, candidates, wanted, skipped, (count) => {
			if (count % every === 0) log(`pass 1: ${count} entities`)
		})
		const kept = entities - IMPORT_SKIPS.reduce((sum, skip) => sum + skipped[skip], 0)
		log(`pass 1: ${entities} entities, ${kept} with a GTIN, ${wanted.size} brands named`)

		const labels = wanted.size === 0 ? new Map<string, string>() : await brandLabels(path, wanted, log, every)
		log(`pass 2: ${labels.size} of ${wanted.size} brands have an English label`)

		const written = await write(sql, run, candidates, labels, skipped, batchSize)
		if (written.records === 0) throw new ImportError('no entity became a record; nothing was withdrawn and the import stays unfinished')
		const finished = await finishImport(sql, run, { full: true, finishedAt: new Date() })

		const total = IMPORT_SKIPS.reduce((sum, skip) => sum + skipped[skip], 0)
		log(`written: ${written.records} records, ${written.changed} changed`)
		log(`skipped: ${total} (${IMPORT_SKIPS.map((skip) => `${skip} ${skipped[skip]}`).join(', ')})`)
		log(`dropped: ${written.dropped} values`)
		log(`withdrawn: ${finished.withdrawn.records} records, ${finished.withdrawn.claims} claims`)
		log(`done in ${((performance.now() - started) / 1000).toFixed(1)} s`)
		return {
			entities,
			written: written.records,
			changed: written.changed,
			skipped,
			dropped: written.dropped,
			withdrawn: finished.withdrawn,
			outcome: finished.outcome,
		}
	} finally {
		await sql.end({ timeout: 5 })
		await rm(scratch, { recursive: true, force: true })
	}
}

const GTIN_NEEDLE = Buffer.from(`"${WIKIDATA_GTIN}"`)
const ITEM_PREFIX = Buffer.from('{"type":"item","id":"Q')

/**
 * Pass 1. An entity that never names the GTIN property cannot become a record, so only the rest is
 * parsed and kept; a line that opens as an item is counted as `no-gtin` without being parsed.
 */
async function collect(
	path: string,
	candidates: string,
	wanted: Set<string>,
	skipped: Record<ImportSkip, number>,
	progress: (count: number) => void,
): Promise<number> {
	const sink = Bun.file(candidates).writer()
	let count = 0
	try {
		for await (const line of entityLines(path)) {
			count += 1
			progress(count)
			if (line === null) {
				skipped.unreadable += 1
				continue
			}
			const named = line.indexOf(GTIN_NEEDLE) !== -1
			if (!named && fastItemId(line) !== null) {
				skipped['no-gtin'] += 1
				continue
			}
			const entity = parse(line)
			if (entity === undefined) {
				skipped.unreadable += 1
				continue
			}
			if (!named) {
				const result = mapWikidataEntity(entity, () => undefined)
				if (!result.ok) {
					skipped[result.skip] += 1
					continue
				}
			} else {
				const result = mapWikidataEntity(entity, () => 'brand')
				if (!result.ok && (result.skip === 'not-an-item' || result.skip === 'no-gtin')) {
					skipped[result.skip] += 1
					continue
				}
			}
			for (const id of wikidataBrandIds(entity)) wanted.add(id)
			await sink.write(line)
			await sink.write('\n')
		}
	} finally {
		await sink.end()
	}
	return count
}

/** Pass 2: the English labels of the brands pass 1 found, stopping once every one has been read. */
async function brandLabels(path: string, wanted: Set<string>, log: (line: string) => void, every: number): Promise<Map<string, string>> {
	const labels = new Map<string, string>()
	const seen = new Set<string>()
	let count = 0
	for await (const line of entityLines(path)) {
		count += 1
		if (count % every === 0) log(`pass 2: ${count} entities`)
		if (line === null) continue
		let id = fastItemId(line)
		let entity: unknown
		if (id === null) {
			entity = parse(line)
			const parsedId = isObject(entity) ? entity.id : undefined
			id = typeof parsedId === 'string' ? parsedId : null
		}
		if (id === null || !wanted.has(id) || seen.has(id)) continue
		entity ??= parse(line)
		seen.add(id)
		const label = wikidataEnglishLabel(entity)
		if (label !== null) labels.set(id, label)
		if (seen.size === wanted.size) break
	}
	return labels
}

async function write(
	sql: Sql,
	run: ImportRun,
	candidates: string,
	labels: Map<string, string>,
	skipped: Record<ImportSkip, number>,
	batchSize: number,
): Promise<{ records: number; changed: number; dropped: number }> {
	const totals = { records: 0, changed: 0, dropped: 0 }
	let batch: PreparedRecord[] = []
	let linesSkipped = 0
	const flush = async () => {
		if (batch.length === 0 && linesSkipped === 0) return
		const result = await importRecords(sql, run, { records: batch, linesSkipped, now: new Date() })
		totals.records += result.seen
		totals.changed += result.changed
		batch = []
		linesSkipped = 0
	}
	for await (const line of entityLines(candidates)) {
		const entity = line === null ? undefined : parse(line)
		const result = mapWikidataEntity(entity, (id) => labels.get(id))
		if (!result.ok) {
			skipped[result.skip] += 1
			if (result.skip === 'invalid') linesSkipped += 1
			continue
		}
		const prepared = await prepareRecord(result.record, run.source)
		if (!prepared.ok) {
			skipped.invalid += 1
			linesSkipped += 1
			continue
		}
		totals.dropped += result.dropped.length
		batch.push(prepared.prepared)
		if (batch.length >= batchSize) await flush()
	}
	linesSkipped += skipped.unreadable
	await flush()
	return totals
}

type Compression = 'gzip' | 'bzip2' | null

async function compression(path: string): Promise<Compression> {
	const head = new Uint8Array(await Bun.file(path).slice(0, 3).arrayBuffer())
	if (head[0] === 0x1f && head[1] === 0x8b) return 'gzip'
	if (head[0] === 0x42 && head[1] === 0x5a && head[2] === 0x68) return 'bzip2'
	return null
}

/**
 * The dump's entities, one per line between the array's `[` and `]`, each without its trailing
 * comma; null for a line longer than `MAX_ENTITY_BYTES`. A compressed dump is read through the
 * system's `gzip` or `bzip2`, which also read the concatenated streams Wikimedia publishes.
 */
async function* entityLines(path: string): AsyncGenerator<Buffer | null> {
	const format = await compression(path)
	if (format === null) {
		yield* splitLines(Bun.file(path).stream())
		return
	}
	const child = Bun.spawn([format, '-dc', path], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
	let finished = false
	try {
		yield* splitLines(child.stdout)
		const code = await child.exited
		if (code !== 0) throw new ImportError(`${format} -dc ${path} exited ${code}: ${(await new Response(child.stderr).text()).trim()}`)
		finished = true
	} finally {
		if (!finished) {
			child.kill()
			await child.exited
		}
	}
}

async function* splitLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<Buffer | null> {
	let parts: Uint8Array[] = []
	let pending = 0
	let discarding = false
	for await (const chunk of stream) {
		let start = 0
		for (;;) {
			const lf = chunk.indexOf(0x0a, start)
			const end = lf === -1 ? chunk.length : lf
			if (!discarding && end > start) {
				if (pending + (end - start) > MAX_ENTITY_BYTES) {
					discarding = true
					parts = []
					pending = 0
				} else {
					parts.push(chunk.subarray(start, end))
					pending += end - start
				}
			}
			if (lf === -1) break
			if (discarding) {
				discarding = false
				yield null
			} else {
				const line = entityLine(parts)
				if (line !== null) yield line
			}
			parts = []
			pending = 0
			start = lf + 1
		}
	}
	if (discarding) yield null
	else if (parts.length > 0) {
		const line = entityLine(parts)
		if (line !== null) yield line
	}
}

function entityLine(parts: Uint8Array[]): Buffer | null {
	const bytes = parts.length === 1 ? Buffer.from(parts[0]!.buffer, parts[0]!.byteOffset, parts[0]!.byteLength) : Buffer.concat(parts)
	let start = 0
	let end = bytes.length
	while (start < end && isSpace(bytes[start]!)) start += 1
	while (end > start && isSpace(bytes[end - 1]!)) end -= 1
	if (end > start && bytes[end - 1] === 0x2c) end -= 1
	if (end === start) return null
	if (end - start === 1 && (bytes[start] === 0x5b || bytes[start] === 0x5d)) return null
	return bytes.subarray(start, end)
}

function isSpace(byte: number): boolean {
	return byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a
}

/** The QID of a line that opens as Wikidata's dumps write an item, `{"type":"item","id":"Q…",`, read without parsing it. */
function fastItemId(line: Buffer): string | null {
	if (line.length <= ITEM_PREFIX.length || line.compare(ITEM_PREFIX, 0, ITEM_PREFIX.length, 0, ITEM_PREFIX.length) !== 0) return null
	let index = ITEM_PREFIX.length
	if (line[index]! < 0x31 || line[index]! > 0x39) return null
	while (index < line.length && line[index]! >= 0x30 && line[index]! <= 0x39) index += 1
	if (line[index] !== 0x22 || line[index + 1] !== 0x2c) return null
	return `Q${line.toString('latin1', ITEM_PREFIX.length, index)}`
}

function parse(line: Buffer): unknown {
	try {
		return JSON.parse(line.toString('utf8'))
	} catch {
		return undefined
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function download(url: string, path: string, log: (line: string) => void): Promise<void> {
	const response = await fetch(url)
	if (!response.ok || response.body === null) {
		await response.body?.cancel()
		throw new ImportError(`${url} answered ${response.status}`)
	}
	const sink = Bun.file(path).writer()
	let bytes = 0
	let next = DOWNLOAD_PROGRESS_BYTES
	try {
		for await (const chunk of response.body) {
			await sink.write(chunk)
			bytes += chunk.byteLength
			if (bytes >= next) {
				log(`downloading: ${bytes} bytes`)
				next += DOWNLOAD_PROGRESS_BYTES
			}
		}
	} finally {
		await sink.end()
	}
	log(`downloaded ${bytes} bytes to ${path}`)
}

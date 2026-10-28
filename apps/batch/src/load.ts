import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { type DumpFile, type DumpManifest, readNdjson, validateDump } from '@prodid/core'
import { createClient, DumpError, loadDump, type LoadResult } from '@prodid/store'

import type { MergeEnv } from './merge'

export const MAX_DUMP_LINE_BYTES = 64 * 1024 * 1024

export class LoadDumpError extends Error {}

export interface LoadDumpOptions {
	log?: (line: string) => void
	now?: Date
	page?: number
}

interface Located {
	manifest: DumpManifest
	/** The dump's directory: a local path, or a URL ending in `/`. */
	directory: string
	remote: boolean
}

/**
 * Loads a dump into an empty index. Every file is checked against the manifest's digest, size and
 * line count before anything is written; a remote dump is downloaded to a temporary directory for
 * that, so it is read only once over the network.
 */
export async function runLoadDump(env: MergeEnv, location: string, options: LoadDumpOptions = {}): Promise<LoadResult> {
	const log = options.log ?? console.log
	const started = performance.now()
	log(`database: ${new URL(env.DATABASE_URL).host}`)

	const dump = await locate(location)
	log(`dump: ${dump.directory}, snapshot ${dump.manifest.snapshot_at}`)

	const local = dump.remote ? await mkdtemp(join(tmpdir(), 'prodid-load-')) : dump.directory
	try {
		const paths = new Map<DumpFile['name'], string>()
		for (const file of dump.manifest.files) {
			const path = join(local, file.name)
			if (dump.remote) await verify(file, await download(new URL(file.name, dump.directory)), path)
			else await verify(file, Bun.file(path).stream())
			paths.set(file.name, path)
			log(`verified ${file.name}: ${file.lines} ${file.lines === 1 ? 'line' : 'lines'}, ${file.bytes} bytes`)
		}

		const lines = (name: DumpFile['name']) => readLines(name, paths.get(name)!)
		const sql = createClient(env.DATABASE_URL, { max: 1, onnotice: () => {} })
		try {
			const result = await loadDump(
				sql,
				{
					sources: lines('sources.ndjson.gz'),
					entities: lines('entities.ndjson.gz'),
					records: lines('records.ndjson.gz'),
					groupings: lines('groupings.ndjson.gz'),
					merges: lines('merges.ndjson.gz'),
				},
				{
					operator: env.PRODID_OPERATOR,
					...(options.now === undefined ? {} : { now: options.now }),
					...(options.page === undefined ? {} : { page: options.page }),
				},
			)
			log(
				`loaded: ${result.sources} sources, ${result.entities} entities, ${result.records} records, ${result.groupings} groupings, ${result.merges} merges`,
			)
			log(`done in ${((performance.now() - started) / 1000).toFixed(1)} s`)
			return result
		} finally {
			await sql.end({ timeout: 5 })
		}
	} finally {
		if (dump.remote) await rm(local, { recursive: true, force: true })
	}
}

/**
 * A dated directory, its `manifest.json`, or a `latest.json`, whose dump is the directory its own
 * `snapshot_at` names next to it.
 */
async function locate(location: string): Promise<Located> {
	if (/^https?:\/\//i.test(location)) {
		const url = new URL(location)
		const manifestUrl = url.pathname.endsWith('.json') ? url : new URL('manifest.json', url.href.endsWith('/') ? url : `${url.href}/`)
		const manifest = parseManifest(await (await download(manifestUrl)).text(), manifestUrl.href)
		const name = basename(manifestUrl.pathname)
		const directory = name === 'manifest.json' ? new URL('./', manifestUrl) : new URL(`${manifest.snapshot_at.slice(0, 10)}/`, manifestUrl)
		return { manifest, directory: directory.href, remote: true }
	}

	let path = resolve(location)
	const found = await stat(path).catch(() => null)
	if (found === null) throw new LoadDumpError(`${location} does not exist`)
	if (found.isDirectory()) {
		const manifest = join(path, 'manifest.json')
		path = (await Bun.file(manifest).exists()) ? manifest : join(path, 'latest.json')
		if (!(await Bun.file(path).exists())) throw new LoadDumpError(`${location} holds neither manifest.json nor latest.json`)
	}
	const manifest = parseManifest(await Bun.file(path).text(), path)
	const directory = basename(path) === 'manifest.json' ? dirname(path) : join(dirname(path), manifest.snapshot_at.slice(0, 10))
	return { manifest, directory, remote: false }
}

function parseManifest(text: string, where: string): DumpManifest {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch (error) {
		throw new LoadDumpError(`${where} is not JSON: ${error instanceof Error ? error.message : String(error)}`)
	}
	const result = validateDump(value)
	if (!result.ok) {
		throw new LoadDumpError(`${where} is not an org.prodid.dump manifest: ${result.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`)
	}
	return result.value
}

async function download(url: URL): Promise<Response> {
	const response = await fetch(url)
	if (!response.ok || response.body === null) {
		await response.body?.cancel()
		throw new LoadDumpError(`${url.href} answered ${response.status}`)
	}
	return response
}

/** Reads a file once: its digest and size as served, then its lines once decompressed, copying it to `copy` when given. */
async function verify(file: DumpFile, body: ReadableStream<Uint8Array<ArrayBuffer>> | Response, copy?: string): Promise<void> {
	const stream = body instanceof Response ? body.body! : body
	const hasher = new Bun.CryptoHasher('sha256')
	const sink = copy === undefined ? null : Bun.file(copy).writer()
	let bytes = 0
	let lines = 0
	let last = 0x0a
	try {
		const measured = stream.pipeThrough(
			new TransformStream<Uint8Array<ArrayBuffer>, BufferSource>({
				async transform(chunk, controller) {
					hasher.update(chunk)
					bytes += chunk.byteLength
					if (sink !== null) await sink.write(chunk)
					controller.enqueue(chunk)
				},
			}),
		)
		const reader = measured.pipeThrough(new DecompressionStream('gzip')).getReader()
		for (;;) {
			const chunk = await reader.read()
			if (chunk.done) break
			for (const byte of chunk.value) if (byte === 0x0a) lines += 1
			if (chunk.value.length > 0) last = chunk.value[chunk.value.length - 1]!
		}
	} catch (error) {
		throw new LoadDumpError(`${file.name}: cannot be read: ${error instanceof Error ? error.message : String(error)}`)
	} finally {
		await sink?.end()
	}
	if (last !== 0x0a) lines += 1
	const digest = hasher.digest('hex')
	if (bytes !== file.bytes) throw new LoadDumpError(`${file.name}: ${bytes} bytes, the manifest says ${file.bytes}`)
	if (digest !== file.sha256) throw new LoadDumpError(`${file.name}: sha256 ${digest}, the manifest says ${file.sha256}`)
	if (lines !== file.lines) throw new LoadDumpError(`${file.name}: ${lines} lines, the manifest says ${file.lines}`)
}

async function* readLines(name: DumpFile['name'], path: string): AsyncGenerator<unknown> {
	const stream = Bun.file(path).stream().pipeThrough(new DecompressionStream('gzip'))
	for await (const entry of readNdjson(stream, { maxLineBytes: MAX_DUMP_LINE_BYTES })) {
		if (!entry.ok) throw new DumpError(name, entry.line, entry.error)
		yield entry.value
	}
}

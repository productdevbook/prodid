import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

import { createClient, type Sql } from './client'

export type { Sql } from './client'

const DB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'db')
const MIGRATE = join(DB_DIR, 'migrate.ts')

export interface Throwaway {
	sql: Sql
	url: string
	name: string
	drop(): Promise<void>
}

/**
 * The dev database, from the environment or from `db/.env`, so `bun test` finds the running
 * container without any extra plumbing and skips cleanly when there is none.
 */
export function databaseUrl(): string | null {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL
	for (const name of ['.env', '.env.example']) {
		const found = readEnv(join(DB_DIR, name))
		if (found !== null) return found
	}
	return null
}

function readEnv(path: string): string | null {
	if (!existsSync(path)) return null
	const line = readFileSync(path, 'utf8')
		.split('\n')
		.find((entry) => entry.startsWith('DATABASE_URL='))
	return line === undefined ? null : line.slice('DATABASE_URL='.length).trim()
}

/**
 * Whether the dev Postgres is up. Without it every database-backed test skips instead of failing,
 * unless `PRODID_REQUIRE_DB=1`, where an unreachable database fails the test file.
 */
export async function databaseReachable(): Promise<boolean> {
	const url = databaseUrl()
	const reachable = url !== null && (await answers(url))
	if (!reachable && process.env.PRODID_REQUIRE_DB === '1') {
		throw new Error(
			url === null
				? 'PRODID_REQUIRE_DB=1 but DATABASE_URL is not set'
				: `PRODID_REQUIRE_DB=1 but no Postgres answers at DATABASE_URL=${redact(url)}`,
		)
	}
	return reachable
}

async function answers(url: string): Promise<boolean> {
	const admin = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} })
	try {
		await admin`select 1`
		return true
	} catch {
		return false
	} finally {
		await admin.end({ timeout: 1 })
	}
}

function redact(url: string): string {
	try {
		const parsed = new URL(url)
		if (parsed.password !== '') parsed.password = '***'
		return parsed.toString()
	} catch {
		return '(unparsable)'
	}
}

/**
 * A throwaway database, migrated by `db/migrate.ts` itself as its own process, so this package never
 * reaches into another owner's module graph. The dev database's own volume is never touched.
 */
export async function createDatabase(): Promise<Throwaway> {
	const url = databaseUrl()
	if (url === null) throw new Error('DATABASE_URL is not set')

	const name = `prodid_edge_${randomBytes(8).toString('hex')}`
	const target = new URL(url)
	target.pathname = `/${name}`

	const admin = postgres(url, { max: 1, onnotice: () => {} })
	await admin.unsafe(`create database "${name}"`)
	await migrate(target.toString())
	const sql = createClient(target.toString(), { max: 8, onnotice: () => {} })

	return {
		sql,
		url: target.toString(),
		name,
		async drop() {
			await sql.end({ timeout: 5 })
			await admin.unsafe(`drop database if exists "${name}" with (force)`)
			await admin.end({ timeout: 5 })
		},
	}
}

export async function withDatabase<T>(run: (sql: Sql, url: string) => Promise<T>): Promise<T> {
	const database = await createDatabase()
	try {
		return await run(database.sql, database.url)
	} finally {
		await database.drop()
	}
}

async function migrate(url: string): Promise<void> {
	const child = Bun.spawn(['bun', 'run', MIGRATE], {
		env: { ...process.env, DATABASE_URL: url },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const code = await child.exited
	if (code !== 0) {
		const details = `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}`
		throw new Error(`db/migrate.ts exited with ${code}: ${details}`)
	}
}

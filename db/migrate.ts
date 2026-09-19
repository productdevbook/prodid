import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres, { type Sql } from 'postgres'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

const LOCK_CLASS = 1_886_350_180
const LOCK_OBJECT = 1

export async function migrate(sql: Sql): Promise<string[]> {
	const run = await sql.reserve()
	let locked = false
	try {
		await run`select pg_advisory_lock(${LOCK_CLASS}, ${LOCK_OBJECT})`
		locked = true

		const [tracked] = await run<{ present: boolean }[]>`
      select to_regclass('schema_migrations') is not null as present
    `
		if (!tracked?.present) {
			await run`
        create table if not exists schema_migrations (
          name       text primary key,
          applied_at timestamptz not null default now()
        )
      `
		}

		const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
		const applied = await run<{ name: string }[]>`select name from schema_migrations`
		const done = new Set(applied.map((row) => row.name))
		const pending = files.filter((name) => !done.has(name))

		for (const name of pending) {
			const body = await Bun.file(join(migrationsDir, name)).text()
			await run.unsafe('begin')
			try {
				await run.unsafe(body)
				await run`insert into schema_migrations (name) values (${name})`
				await run.unsafe('commit')
			} catch (error) {
				await run.unsafe('rollback')
				throw error
			}
		}

		return pending
	} finally {
		// The lock is session-level and the connection goes back to a shared pool, so it has to
		// be given up here or a failed run strands it. A dead connection has already dropped it.
		if (locked) await run`select pg_advisory_unlock(${LOCK_CLASS}, ${LOCK_OBJECT})`.catch(() => {})
		run.release()
	}
}

if (import.meta.main) {
	const url = process.env.DATABASE_URL
	if (!url) {
		console.error('DATABASE_URL is not set')
		process.exit(1)
	}

	const sql = postgres(url, { max: 1 })
	try {
		const pending = await migrate(sql)
		console.log(pending.length ? `applied ${pending.join(', ')}` : 'up to date')
	} finally {
		await sql.end()
	}
}

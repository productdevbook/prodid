import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres, { type Sql } from 'postgres'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function migrate(sql: Sql): Promise<string[]> {
	const [tracked] = await sql<{ present: boolean }[]>`
    select to_regclass('schema_migrations') is not null as present
  `
	if (!tracked?.present) {
		await sql`
      create table schema_migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )
    `
	}

	const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
	const applied = await sql<{ name: string }[]>`select name from schema_migrations`
	const done = new Set(applied.map((row) => row.name))
	const pending = files.filter((name) => !done.has(name))

	for (const name of pending) {
		const body = await Bun.file(join(migrationsDir, name)).text()
		await sql.begin(async (tx) => {
			await tx.unsafe(body)
			await tx`insert into schema_migrations (name) values (${name})`
		})
	}

	return pending
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

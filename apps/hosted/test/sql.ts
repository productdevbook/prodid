import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'

import type { Sql, SqlValue } from '../src/sql'

const MIGRATIONS = new URL('../migrations/', import.meta.url)

/** A fresh in-memory database with every migration applied, as `wrangler d1 migrations apply` would. */
export function memorySql(): Sql & { database: Database } {
	const database = new Database(':memory:', { strict: true })
	database.run('pragma foreign_keys = on')
	for (const name of readdirSync(MIGRATIONS)
		.filter((file) => file.endsWith('.sql'))
		.toSorted()) {
		database.run(readFileSync(new URL(name, MIGRATIONS), 'utf8'))
	}
	return {
		database,
		async run(query: string, ...params: SqlValue[]) {
			return database.query(query).run(...params).changes
		},
		async first<T>(query: string, ...params: SqlValue[]) {
			return (database.query(query).get(...params) as T | null) ?? null
		},
		async all<T>(query: string, ...params: SqlValue[]) {
			return database.query(query).all(...params) as T[]
		},
	}
}

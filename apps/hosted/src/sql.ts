export type SqlValue = string | number | null

/** The accounts database: D1 in the Worker, an in-memory SQLite in the tests. */
export interface Sql {
	/** Runs a statement and answers how many rows it changed. */
	run(query: string, ...params: SqlValue[]): Promise<number>
	first<T>(query: string, ...params: SqlValue[]): Promise<T | null>
	all<T>(query: string, ...params: SqlValue[]): Promise<T[]>
}

export function d1Sql(database: D1Database): Sql {
	return {
		async run(query, ...params) {
			const result = await database
				.prepare(query)
				.bind(...params)
				.run()
			return result.meta.changes
		},
		first<T>(query: string, ...params: SqlValue[]) {
			return database
				.prepare(query)
				.bind(...params)
				.first<T>()
		},
		async all<T>(query: string, ...params: SqlValue[]) {
			const result = await database
				.prepare(query)
				.bind(...params)
				.all<T>()
			return result.results
		},
	}
}

import type { Sql } from './client'

export interface DeadLetterSeen {
	queue: string
	at: Date
	message: string
}

/** A batch consumed from a dead letter queue. A late writer never moves the time backwards. */
export async function recordDeadLetter(sql: Sql, seen: DeadLetterSeen): Promise<void> {
	await sql`
		insert into dead_letter (queue, last_at, message) values (${seen.queue}, ${seen.at}, ${seen.message})
		on conflict (queue) do update set last_at = excluded.last_at, message = excluded.message
		where dead_letter.last_at <= excluded.last_at
	`
}

/** The most recent dead letter of any queue, or null when none was ever consumed. */
export async function lastDeadLetter(sql: Sql): Promise<DeadLetterSeen | null> {
	const [row] = await sql<{ queue: string; last_at: Date; message: string }[]>`
		select queue, last_at, message from dead_letter order by last_at desc limit 1
	`
	return row === undefined ? null : { queue: row.queue, at: row.last_at, message: row.message }
}

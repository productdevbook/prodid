import type { Sql } from './sql'

export const SITES_PER_ACCOUNT = 5
export const HOLD_DAYS = 30

const DAY = 86_400_000

export type Claim = { ok: true } | { ok: false; reason: 'limit' | 'taken' | 'held' }

export const CHECK_SECONDS = 60

/**
 * Takes the site's one domain check of the minute, in the statement that checks it is free.
 * Answers 0 when taken, or how many seconds remain until the next one.
 */
export async function takeCheck(sql: Sql, slug: string, now: Date): Promise<number> {
	const changed = await sql.run(
		'update site set checked_at = ? where slug = ? and deleted_at is null and (checked_at is null or checked_at <= ?)',
		now.toISOString(),
		slug,
		new Date(now.getTime() - CHECK_SECONDS * 1000).toISOString(),
	)
	if (changed === 1) return 0
	const row = await sql.first<{ checked_at: string | null }>('select checked_at from site where slug = ?', slug)
	const since = row === null || row.checked_at === null ? 0 : now.getTime() - Date.parse(row.checked_at)
	return Math.max(1, Math.ceil(CHECK_SECONDS - since / 1000))
}

export async function ownedSlugs(sql: Sql, accountId: string): Promise<string[]> {
	const rows = await sql.all<{ slug: string }>(
		'select slug from site where account_id = ? and deleted_at is null order by created_at, slug',
		accountId,
	)
	return rows.map((row) => row.slug)
}

export async function ownsSite(sql: Sql, accountId: string, slug: string): Promise<boolean> {
	return (await sql.first('select 1 from site where slug = ? and account_id = ? and deleted_at is null', slug, accountId)) !== null
}

export async function holdsDeleted(sql: Sql, accountId: string, slug: string): Promise<boolean> {
	return (await sql.first('select 1 from site where slug = ? and account_id = ? and deleted_at is not null', slug, accountId)) !== null
}

/**
 * Takes a slug for an account in one statement, so two tabs cannot both pass the limit or both take
 * the name. A deleted site's slug stays with its last owner for 30 days; after that anyone may take it.
 */
export async function claimSlug(sql: Sql, accountId: string, slug: string, now: Date): Promise<Claim> {
	const at = now.toISOString()
	const releasedBefore = new Date(now.getTime() - HOLD_DAYS * DAY).toISOString()
	const changed = await sql.run(
		`insert into site (slug, account_id, created_at)
		 select ?, ?, ?
		 where (select count(*) from site where account_id = ? and deleted_at is null) < ?
		 on conflict (slug) do update set account_id = excluded.account_id, created_at = excluded.created_at, deleted_at = null
		 where site.deleted_at is not null and (site.deleted_at <= ? or site.account_id = excluded.account_id)`,
		slug,
		accountId,
		at,
		accountId,
		SITES_PER_ACCOUNT,
		releasedBefore,
	)
	if (changed === 1) return { ok: true }
	const owned = await sql.first<{ count: number }>(
		'select count(*) as count from site where account_id = ? and deleted_at is null',
		accountId,
	)
	if ((owned?.count ?? 0) >= SITES_PER_ACCOUNT) return { ok: false, reason: 'limit' }
	const row = await sql.first<{ deleted_at: string | null }>('select deleted_at from site where slug = ?', slug)
	return { ok: false, reason: row === null || row.deleted_at === null ? 'taken' : 'held' }
}

/** Gives a claim back after its site.json could not be written, as if it had never been taken. */
export async function unclaimSlug(sql: Sql, accountId: string, slug: string): Promise<void> {
	await sql.run('delete from site where slug = ? and account_id = ? and deleted_at is null', slug, accountId)
}

/** Holds the slug of a deleted site, owned or not, for the 30 days the index keeps its claims. */
export async function releaseSite(sql: Sql, slug: string, now: Date): Promise<void> {
	const at = now.toISOString()
	await sql.run(
		`insert into site (slug, account_id, created_at, deleted_at) values (?, null, ?, ?)
		 on conflict (slug) do update set deleted_at = excluded.deleted_at`,
		slug,
		at,
		at,
	)
}

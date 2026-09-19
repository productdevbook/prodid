export interface SqlCursor<T> {
	toArray(): T[]
}

/** The slice of a SQLite-backed Durable Object's storage this code needs. */
export interface SqlLike {
	exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T>
}

export interface Decision {
	ok: boolean
	retryAfterMs: number
}

export interface HostDecision extends Decision {
	/** The stored count of sources verified at this host is missing or stale; the caller should refresh it. */
	needsCount: boolean
}

export const BASE_VERIFIED_LANE = 40
export const BASE_UNVERIFIED_LANE = 20
export const MAX_VERIFIED_LANE = 600
export const MAX_UNVERIFIED_LANE = 200

/**
 * Both lanes grow with the number of sources verified at the host, because a host serving documents
 * for thousands of domains has asked to be crawled. Strangers' domains pointed at a host never
 * verify, so nothing an attacker controls raises either number.
 */
export function laneLimits(verifiedSources: number): { total: number; unverified: number } {
	const verified = clamp(Math.floor(verifiedSources / 100), BASE_VERIFIED_LANE, MAX_VERIFIED_LANE)
	const unverified = clamp(Math.floor(verifiedSources / 500), BASE_UNVERIFIED_LANE, MAX_UNVERIFIED_LANE)
	return { total: verified + unverified, unverified }
}

export function initLimitSchema(sql: SqlLike): void {
	sql.exec('create table if not exists hits (lane text not null, at integer not null)')
	sql.exec('create index if not exists hits_lane on hits (lane, at)')
	sql.exec('create table if not exists meta (name text primary key, value integer not null, at integer not null)')
}

/** One event per window: the per-domain discovery gate. A second attempt inside it is deferred, never refused. */
export function gateOnce(sql: SqlLike, now: number, windowMs: number): Decision {
	return takeWindow(sql, 'gate', now, windowMs, 1)
}

/**
 * An exact sliding window. Every event inside it is a row, so the count is the answer rather than an
 * approximation of it, and the retry-after is the moment the oldest one leaves.
 */
export function takeWindow(sql: SqlLike, lane: string, now: number, windowMs: number, limit: number): Decision {
	const since = now - windowMs
	sql.exec('delete from hits where lane = ? and at <= ?', lane, since)
	const rows = sql
		.exec<{ used: number; oldest: number | null }>('select count(*) as used, min(at) as oldest from hits where lane = ?', lane)
		.toArray()
	const state = rows[0] ?? { used: 0, oldest: null }
	if (state.used >= limit) return { ok: false, retryAfterMs: retryAfter(state.oldest, now, windowMs) }
	sql.exec('insert into hits (lane, at) values (?, ?)', lane, now)
	return { ok: true, retryAfterMs: 0 }
}

/**
 * The per-host budget. An unverified fetch has to fit in both the total and the unverified lane; a
 * verified one only in the total, which is what reserves the rest of it for the host's own crawls.
 */
export function takeHost(
	sql: SqlLike,
	now: number,
	windowMs: number,
	verified: boolean,
	options: { staleAfterMs: number; fallbackVerifiedSources?: number },
): HostDecision {
	const since = now - windowMs
	sql.exec('delete from hits where lane in (?, ?) and at <= ?', 'verified', 'unverified', since)

	const counted = sql.exec<{ value: number; at: number }>('select value, at from meta where name = ?', 'verified_sources').toArray()
	const stored = counted[0]
	const verifiedSources = stored?.value ?? options.fallbackVerifiedSources ?? 0
	const needsCount = stored === undefined || now - stored.at > options.staleAfterMs
	const limits = laneLimits(verifiedSources)

	const rows = sql
		.exec<{ lane: string; used: number; oldest: number }>(
			'select lane, count(*) as used, min(at) as oldest from hits where lane in (?, ?) group by lane',
			'verified',
			'unverified',
		)
		.toArray()
	let total = 0
	let unverified = 0
	let oldest: number | null = null
	for (const row of rows) {
		total += row.used
		if (row.lane === 'unverified') unverified += row.used
		oldest = oldest === null ? row.oldest : Math.min(oldest, row.oldest)
	}

	if (total >= limits.total || (!verified && unverified >= limits.unverified)) {
		return { ok: false, retryAfterMs: retryAfter(oldest, now, windowMs), needsCount }
	}
	sql.exec('insert into hits (lane, at) values (?, ?)', verified ? 'verified' : 'unverified', now)
	return { ok: true, retryAfterMs: 0, needsCount }
}

export function setVerifiedSources(sql: SqlLike, count: number, now: number): void {
	sql.exec(
		'insert into meta (name, value, at) values (?, ?, ?) on conflict (name) do update set value = excluded.value, at = excluded.at',
		'verified_sources',
		count,
		now,
	)
}

function retryAfter(oldest: number | null, now: number, windowMs: number): number {
	if (oldest === null) return windowMs
	return Math.max(1, oldest + windowMs - now)
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value))
}

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

/**
 * How much of the unverified lane one registrable domain may hold: a max-min fair share that always
 * counts room for one more. With `zones` contending inside the window, the share is
 * `ceil(lane / (zones + 1))`, so while `zones + 1 <= lane` there is a slot left for a zone that has
 * not been seen yet — a publisher pointing its own new domain at a busy host is never behind an
 * established crowd for longer than a window.
 *
 * Starving that lane therefore costs `lane` registrable domains rather than a constant four, and the
 * price scales with the capacity instead of staying flat. It is still a price and not a barrier.
 * The honest caveat: a burst of legitimate zones shrinks everyone's share the same way an attacker's
 * would, and the only reason that is acceptable is that the verified lane is never touched — the
 * host's own publishers keep being crawled throughout.
 */
function zoneShare(lane: number, zones: number): number {
	return Math.max(1, Math.ceil(lane / (zones + 1)))
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

export const MEDIA_FETCHES_PER_MINUTE = 10
export const MEDIA_BYTES_PER_MINUTE = 209_715_200

export interface MediaDecision extends Decision {
	/** Identifies the reservation, so the bytes actually read can be settled against it. */
	ticket: number | null
}

export function initLimitSchema(sql: SqlLike): void {
	sql.exec(
		"create table if not exists hits (lane text not null, at integer not null, zone text not null default '', bytes integer not null default 0)",
	)
	sql.exec('create index if not exists hits_lane on hits (lane, at)')
	sql.exec('create table if not exists meta (name text primary key, value integer not null, at integer not null)')
}

/** True once nothing is left inside any window: the bucket can be deleted rather than kept forever. */
export function isEmpty(sql: SqlLike, now: number, windowMs: number): boolean {
	sql.exec('delete from hits where at <= ?', now - windowMs)
	const rows = sql.exec<{ used: number }>('select count(*) as used from hits').toArray()
	return (rows[0]?.used ?? 0) === 0
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
	options: { staleAfterMs: number; zone?: string },
): HostDecision {
	const since = now - windowMs
	sql.exec('delete from hits where lane in (?, ?) and at <= ?', 'verified', 'unverified', since)

	const counted = sql.exec<{ value: number; at: number }>('select value, at from meta where name = ?', 'verified_sources').toArray()
	const stored = counted[0]
	const verifiedSources = stored?.value ?? 0
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

	const zone = options.zone ?? ''
	if (!verified && zone !== '') {
		const mine = sql
			.exec<{ used: number; oldest: number | null }>(
				'select count(*) as used, min(at) as oldest from hits where lane = ? and zone = ?',
				'unverified',
				zone,
			)
			.toArray()[0]
		const contending = sql
			.exec<{ zones: number }>("select count(distinct zone) as zones from hits where lane = ? and zone <> ''", 'unverified')
			.toArray()[0]
		const share = zoneShare(limits.unverified, contending?.zones ?? 0)
		if ((mine?.used ?? 0) >= share) {
			return { ok: false, retryAfterMs: retryAfter(mine?.oldest ?? null, now, windowMs), needsCount }
		}
	}

	sql.exec('insert into hits (lane, at, zone) values (?, ?, ?)', verified ? 'verified' : 'unverified', now, zone)
	return { ok: true, retryAfterMs: 0, needsCount }
}

/**
 * The media budget at one host: ten fetches and 200 MiB a minute, on top of the unverified lane.
 * The entry's cap is reserved before the fetch, because what a file weighs is only known after it
 * has been read and a budget that counts bytes afterwards has already spent them.
 */
export function takeMediaHost(
	sql: SqlLike,
	now: number,
	windowMs: number,
	reserve: number,
	limits: { fetches: number; bytes: number } = { fetches: MEDIA_FETCHES_PER_MINUTE, bytes: MEDIA_BYTES_PER_MINUTE },
): MediaDecision {
	sql.exec('delete from hits where lane = ? and at <= ?', 'media', now - windowMs)
	const state = sql
		.exec<{ used: number; bytes: number; oldest: number | null }>(
			'select count(*) as used, coalesce(sum(bytes), 0) as bytes, min(at) as oldest from hits where lane = ?',
			'media',
		)
		.toArray()[0]
	const used = state?.used ?? 0
	const bytes = state?.bytes ?? 0
	if (used >= limits.fetches || bytes + reserve > limits.bytes) {
		return { ok: false, retryAfterMs: retryAfter(state?.oldest ?? null, now, windowMs), ticket: null }
	}
	const inserted = sql
		.exec<{ rowid: number }>("insert into hits (lane, at, zone, bytes) values (?, ?, '', ?) returning rowid", 'media', now, reserve)
		.toArray()[0]
	return { ok: true, retryAfterMs: 0, ticket: inserted?.rowid ?? null }
}

/**
 * What the file actually weighed. Settling is not optional and not only for success: a reservation
 * left at the entry's cap after a fetch that failed or was aborted would sit in the window for a
 * minute as if those bytes had been spent.
 */
export function settleMediaBytes(sql: SqlLike, ticket: number, bytes: number): void {
	sql.exec('update hits set bytes = ? where rowid = ? and lane = ?', bytes, ticket, 'media')
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

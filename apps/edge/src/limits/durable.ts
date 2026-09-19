import { DurableObject } from 'cloudflare:workers'

import {
	type Decision,
	gateOnce,
	type HostDecision,
	initLimitSchema,
	isEmpty,
	type MediaDecision,
	settleMediaBytes,
	setVerifiedSources,
	type SqlLike,
	takeHost,
	takeMediaHost,
	takeWindow,
} from './window'

/** The longest window any bucket counts over, plus slack, is when a bucket can be thrown away. */
const LONGEST_WINDOW_MS = 3_600_000
const SWEEP_SLACK_MS = 60_000

/**
 * One object per bucket — one pinged domain, one registrable domain, one caller, one fetched host —
 * so every count is taken at a single place in the world. A per-datacentre approximation of a limit
 * that exists to stop an attacker is not the limit.
 */
export class RateLimiter extends DurableObject<Env> {
	gate(now: number, windowMs: number): Decision {
		return this.armed(now, () => gateOnce(this.sql, now, windowMs))
	}

	take(lane: string, now: number, windowMs: number, limit: number): Decision {
		return this.armed(now, () => takeWindow(this.sql, lane, now, windowMs, limit))
	}

	host(now: number, windowMs: number, verified: boolean, staleAfterMs: number, zone?: string): HostDecision {
		return this.armed(now, () => takeHost(this.sql, now, windowMs, verified, { staleAfterMs, zone: zone ?? '' }))
	}

	media(now: number, windowMs: number, reserve: number): MediaDecision {
		return this.armed(now, () => takeMediaHost(this.sql, now, windowMs, reserve))
	}

	settleMedia(ticket: number, bytes: number): void {
		this.ready()
		settleMediaBytes(this.sql, ticket, bytes)
	}

	count(verifiedSources: number, now: number): void {
		this.ready()
		setVerifiedSources(this.sql, verifiedSources, now)
	}

	/**
	 * A bucket is created from unauthenticated input — one per pinged domain — so it has to be able
	 * to go away again. Once nothing is left inside the longest window it counts over, it deletes
	 * its own storage; otherwise it asks to be looked at again later.
	 */
	override async alarm(): Promise<void> {
		this.ready()
		const now = Date.now()
		if (isEmpty(this.sql, now, LONGEST_WINDOW_MS)) {
			await this.ctx.storage.deleteAll()
			return
		}
		await this.ctx.storage.setAlarm(now + LONGEST_WINDOW_MS + SWEEP_SLACK_MS)
	}

	private armed<T>(now: number, run: () => T): T {
		this.ready()
		const decision = run()
		void this.ctx.storage.setAlarm(now + LONGEST_WINDOW_MS + SWEEP_SLACK_MS)
		return decision
	}

	/** `deleteAll` takes the tables with it, so every entry point makes sure they are there. */
	private ready(): void {
		initLimitSchema(this.sql)
	}

	private get sql(): SqlLike {
		return this.ctx.storage.sql as unknown as SqlLike
	}
}

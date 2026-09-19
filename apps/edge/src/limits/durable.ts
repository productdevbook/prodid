import { DurableObject } from 'cloudflare:workers'

import {
	type Decision,
	gateOnce,
	type HostDecision,
	initLimitSchema,
	setVerifiedSources,
	type SqlLike,
	takeHost,
	takeWindow,
} from './window'

/**
 * One object per bucket — one pinged domain, one registrable domain, one caller, one fetched host —
 * so every count is taken at a single place in the world. A per-datacentre approximation of a limit
 * that exists to stop an attacker is not the limit.
 */
export class RateLimiter extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		ctx.blockConcurrencyWhile(async () => {
			initLimitSchema(this.sql)
		})
	}

	gate(now: number, windowMs: number): Decision {
		return gateOnce(this.sql, now, windowMs)
	}

	take(lane: string, now: number, windowMs: number, limit: number): Decision {
		return takeWindow(this.sql, lane, now, windowMs, limit)
	}

	host(now: number, windowMs: number, verified: boolean, staleAfterMs: number): HostDecision {
		return takeHost(this.sql, now, windowMs, verified, { staleAfterMs })
	}

	count(verifiedSources: number, now: number): void {
		setVerifiedSources(this.sql, verifiedSources, now)
	}

	private get sql(): SqlLike {
		return this.ctx.storage.sql as unknown as SqlLike
	}
}

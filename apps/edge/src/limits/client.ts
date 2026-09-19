import type { RateLimiter } from './durable'
import { POLICY } from './policy'
import type { Decision, HostDecision, MediaDecision } from './window'

export type { Decision, HostDecision, MediaDecision } from './window'

/** What the routes and the crawler ask before they spend anything on a stranger's word. */
export interface Limiter {
	/** Discovery of one domain, at most once per window. */
	domainGate(domain: string, now: Date): Promise<Decision>
	/** Ping requests from one caller. */
	caller(key: string, now: Date): Promise<Decision>
	/** First contact with a domain under a registrable domain nobody has introduced yet. */
	firstContact(registrable: string, now: Date): Promise<Decision>
	/**
	 * One fetch of one host, in the verified or the unverified lane. `zone` is the registrable
	 * domain the fetch is on behalf of; it bounds any one zone's share of the unverified lane.
	 */
	hostFetch(host: string, verified: boolean, now: Date, zone?: string): Promise<HostDecision>
	/** Tells the host's bucket how many sources are verified there, so both lanes can scale. */
	reportVerifiedSources(host: string, count: number, now: Date): Promise<void>
	/** One media fetch at a host, reserving the bytes it may weigh. */
	mediaFetch(host: string, reserve: number, now: Date): Promise<MediaDecision>
	/** The bytes it actually weighed, success or not. */
	settleMedia(host: string, ticket: number, bytes: number): Promise<void>
}

export class DurableLimiter implements Limiter {
	constructor(private readonly namespace: DurableObjectNamespace<RateLimiter>) {}

	domainGate(domain: string, now: Date): Promise<Decision> {
		return this.at(`domain:${domain}`).gate(now.getTime(), POLICY.domainWindowMs)
	}

	caller(key: string, now: Date): Promise<Decision> {
		return this.at(`caller:${key}`).take('caller', now.getTime(), POLICY.caller.windowMs, POLICY.caller.limit)
	}

	firstContact(registrable: string, now: Date): Promise<Decision> {
		return this.at(`registrable:${registrable}`).take('first-contact', now.getTime(), POLICY.registrable.windowMs, POLICY.registrable.limit)
	}

	hostFetch(host: string, verified: boolean, now: Date, zone?: string): Promise<HostDecision> {
		return this.at(`host:${host}`).host(now.getTime(), POLICY.host.windowMs, verified, POLICY.host.staleAfterMs, zone)
	}

	async reportVerifiedSources(host: string, count: number, now: Date): Promise<void> {
		await this.at(`host:${host}`).count(count, now.getTime())
	}

	mediaFetch(host: string, reserve: number, now: Date): Promise<MediaDecision> {
		return this.at(`host:${host}`).media(now.getTime(), POLICY.host.windowMs, reserve)
	}

	async settleMedia(host: string, ticket: number, bytes: number): Promise<void> {
		await this.at(`host:${host}`).settleMedia(ticket, bytes)
	}

	private at(name: string): DurableObjectStub<RateLimiter> {
		return this.namespace.get(this.namespace.idFromName(name))
	}
}

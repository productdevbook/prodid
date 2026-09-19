import { describe, expect, test } from 'bun:test'

import { chooseVariant } from '../src/http'
import { callerKey, HOUR_MS, POLICY } from '../src/limits/policy'
import { isEmpty, laneLimits } from '../src/limits/window'
import { LocalLimiter, TestClock } from './support/fakes'

const AT = new Date('2026-09-19T08:00:00.000Z')

describe('lane limits', () => {
	test('a host nobody is verified at gets the base rate, and both lanes grow with the sources there', () => {
		expect(laneLimits(0)).toEqual({ total: 60, unverified: 20 })
		expect(laneLimits(3_000)).toEqual({ total: 60, unverified: 20 })
		expect(laneLimits(5_000)).toEqual({ total: 70, unverified: 20 })
		expect(laneLimits(100_000)).toEqual({ total: 800, unverified: 200 })
		expect(laneLimits(10_000_000)).toEqual({ total: 800, unverified: 200 })
	})
})

describe('the per-host budget', () => {
	test('unverified discovery stops at 20 a minute and never touches the verified reserve', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		let allowed = 0
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const decision = await limits.hostFetch('acme.prodid.org', false, clock.now())
			if (decision.ok) allowed += 1
		}
		expect(allowed).toBe(20)

		let verified = 0
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const decision = await limits.hostFetch('acme.prodid.org', true, clock.now())
			if (decision.ok) verified += 1
		}
		expect(verified).toBe(40)
	})

	test('the window slides: capacity comes back exactly one window after it was spent', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		for (let attempt = 0; attempt < 20; attempt += 1) await limits.hostFetch('h.example', false, clock.now())

		const blocked = await limits.hostFetch('h.example', false, clock.now())
		expect(blocked.ok).toBe(false)
		expect(blocked.retryAfterMs).toBe(POLICY.host.windowMs)

		clock.advance(POLICY.host.windowMs)
		expect((await limits.hostFetch('h.example', false, clock.now())).ok).toBe(true)
	})
})

describe('the per-domain gate', () => {
	test('one discovery per ten minutes, and being early is a deferral with a time on it', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		expect((await limits.domainGate('acme.example', clock.now())).ok).toBe(true)

		clock.advance(60_000)
		const second = await limits.domainGate('acme.example', clock.now())
		expect(second.ok).toBe(false)
		expect(second.retryAfterMs).toBe(POLICY.domainWindowMs - 60_000)

		clock.advance(POLICY.domainWindowMs)
		expect((await limits.domainGate('acme.example', clock.now())).ok).toBe(true)
	})
})

describe('the caller budget', () => {
	test('60 ping requests an hour, counted per address block', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		let allowed = 0
		for (let attempt = 0; attempt < 80; attempt += 1) {
			if ((await limits.caller('198.51.100.7', clock.now())).ok) allowed += 1
		}
		expect(allowed).toBe(POLICY.caller.limit)
		expect((await limits.caller('198.51.100.8', clock.now())).ok).toBe(true)
	})

	test('an IPv6 caller is a /64, so a new address in the same block is the same caller', () => {
		expect(callerKey('2001:db8:1:2:3:4:5:6')).toBe(callerKey('2001:db8:1:2:ffff:ffff:ffff:ffff'))
		expect(callerKey('2001:db8:1:2::1')).not.toBe(callerKey('2001:db8:1:3::1'))
		expect(callerKey('198.51.100.7')).toBe('198.51.100.7')
	})
})

describe('content negotiation', () => {
	test('a browser gets HTML, a client asking for anything gets JSON', () => {
		expect(chooseVariant('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe('html')
		expect(chooseVariant('*/*')).toBe('json')
		expect(chooseVariant('application/json')).toBe('json')
		expect(chooseVariant(null)).toBe('json')
		expect(chooseVariant('text/html')).toBe('html')
		expect(chooseVariant('application/json;q=0.1, text/html;q=0.9')).toBe('html')
	})
})

describe('the unverified lane is shared between zones', () => {
	async function fill(limits: LocalLimiter, clock: TestClock, host: string, zone: string, attempts: number): Promise<number> {
		let taken = 0
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			if ((await limits.hostFetch(host, false, clock.now(), zone)).ok) taken += 1
		}
		return taken
	}

	test('one zone alone keeps a share and leaves room for the next', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		// Lane of 20 at a host nobody is verified at: ceil(20 / (1 + 1)).
		expect(await fill(limits, clock, 'busy.example', 'attacker.example', 40)).toBe(10)
		// And what it left is there for anyone else.
		expect((await limits.hostFetch('busy.example', false, clock.now(), 'newcomer.example')).ok).toBe(true)
	})

	test('more zones than slots means one slot each and the lane is the only bound', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		let admitted = 0
		for (let zone = 0; zone < 40; zone += 1) {
			if ((await limits.hostFetch('busy.example', false, clock.now(), `z${zone}.example`)).ok) admitted += 1
		}
		expect(admitted).toBe(20)
	})

	test('the price of starving a lane scales with the lane', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		// A host with many verified sources has a lane of 200, so filling it costs 200 zones.
		await limits.reportVerifiedSources('huge.example', 100_000, clock.now())
		let admitted = 0
		for (let zone = 0; zone < 400; zone += 1) {
			if ((await limits.hostFetch('huge.example', false, clock.now(), `z${zone}.example`)).ok) admitted += 1
		}
		expect(admitted).toBe(200)
		// One zone on its own could only ever have held ceil(200 / 2).
		const alone = new LocalLimiter()
		await alone.reportVerifiedSources('huge.example', 100_000, clock.now())
		expect(await fill(alone, clock, 'huge.example', 'attacker.example', 400)).toBe(100)
	})

	test('a newcomer held back by a contended lane is deferred, and gets its slot within one window', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		for (let zone = 0; zone < 20; zone += 1) await limits.hostFetch('busy.example', false, clock.now(), `z${zone}.example`)

		const held = await limits.hostFetch('busy.example', false, clock.now(), 'newcomer.example')
		expect(held.ok).toBe(false)
		expect(held.retryAfterMs).toBeLessThanOrEqual(POLICY.host.windowMs)

		clock.advance(POLICY.host.windowMs)
		expect((await limits.hostFetch('busy.example', false, clock.now(), 'newcomer.example')).ok).toBe(true)
		// The host's own verified crawls were never touched by any of it.
		expect((await limits.hostFetch('busy.example', true, clock.now())).ok).toBe(true)
	})
})

describe('a bucket goes away again', () => {
	test('once nothing is left inside the window the storage is empty and can be deleted', async () => {
		const clock = new TestClock(AT)
		const limits = new LocalLimiter()
		await limits.domainGate('acme.example', clock.now())
		const bucket = limits.bucketFor('domain:acme.example')

		expect(isEmpty(bucket, clock.now().getTime(), HOUR_MS)).toBe(false)
		clock.advance(HOUR_MS + 1)
		expect(isEmpty(bucket, clock.now().getTime(), HOUR_MS)).toBe(true)
	})
})

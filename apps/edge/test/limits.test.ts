import { describe, expect, test } from 'bun:test'

import { chooseVariant } from '../src/http'
import { callerKey, POLICY } from '../src/limits/policy'
import { laneLimits } from '../src/limits/window'
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

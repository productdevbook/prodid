import { describe, expect, test } from 'bun:test'

import { MAX_PING_DOMAINS, parsePingRequest } from '../src/ping'

describe('parsePingRequest', () => {
	test('accepts one domain and normalizes it', () => {
		expect(parsePingRequest({ domain: 'ACME.Example.' })).toEqual({ ok: true, domains: ['acme.example'] })
	})

	test('accepts a list and collapses duplicates in the order first asked for', () => {
		expect(parsePingRequest({ domains: ['b.example', 'A.example', 'a.example.', 'b.example'] })).toEqual({
			ok: true,
			domains: ['b.example', 'a.example'],
		})
	})

	test('accepts a full batch and refuses one more', () => {
		const domains = Array.from({ length: MAX_PING_DOMAINS }, (_unused, index) => `shop${index}.example`)
		expect(parsePingRequest({ domains }).ok).toBe(true)
		expect(parsePingRequest({ domains: [...domains, 'extra.example'] })).toEqual({
			ok: false,
			reason: 'too-many-domains',
			detail: String(MAX_PING_DOMAINS + 1),
		})
	})

	test('refuses a body that is not an object', () => {
		for (const body of [null, undefined, 'acme.example', 42, ['acme.example']]) {
			expect(parsePingRequest(body)).toEqual({ ok: false, reason: 'not-an-object' })
		}
	})

	test('refuses a body that names no domain, or names both ways at once', () => {
		for (const body of [{}, { domain: 42 }, { domains: [] }, { domains: 'acme.example' }, { domains: ['a.example', 7] }]) {
			expect(parsePingRequest(body)).toEqual({ ok: false, reason: 'missing-domain' })
		}
		expect(parsePingRequest({ domain: 'a.example', domains: ['b.example'] })).toEqual({ ok: false, reason: 'missing-domain' })
	})

	test('refuses any entry that is not a domain, and does not echo it back unbounded', () => {
		expect(parsePingRequest({ domain: '127.0.0.1' })).toEqual({ ok: false, reason: 'bad-domain', detail: '127.0.0.1' })
		expect(parsePingRequest({ domains: ['a.example', 'https://b.example/'] })).toEqual({
			ok: false,
			reason: 'bad-domain',
			detail: 'https://b.example/',
		})
		for (const value of ['localhost', '[::1]', 'acme.example:443', 'ac me.example', '']) {
			expect(parsePingRequest({ domain: value }).ok).toBe(false)
		}
		const rejected = parsePingRequest({ domain: 'x'.repeat(5000) })
		expect(rejected.ok ? '' : (rejected.detail?.length ?? 0)).toBe(64)
	})
})

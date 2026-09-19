import { describe, expect, test } from 'bun:test'

import { publicSuffix, registrableDomain } from '../src/suffix'

describe('registrableDomain', () => {
	test('reduces a host to the name someone registered', () => {
		expect(registrableDomain('acme.example')).toBe('acme.example')
		expect(registrableDomain('shop.eu.acme.example')).toBe('acme.example')
		expect(registrableDomain('WWW.Acme.CO.UK')).toBe('acme.co.uk')
		expect(registrableDomain('shop.example.com.tr')).toBe('example.com.tr')
		expect(registrableDomain('acme.prodid.org')).toBe('prodid.org')
	})

	test('keeps a delegated suffix out of the way unless it is asked for', () => {
		expect(registrableDomain('a.b.github.io')).toBe('github.io')
		expect(registrableDomain('a.b.github.io', { privateSuffixes: true })).toBe('b.github.io')
	})

	test('returns null for what is not a registrable domain', () => {
		for (const value of ['co.uk', 'example', 'localhost', '127.0.0.1', '[::1]', '', 'https://acme.example/']) {
			expect(registrableDomain(value)).toBeNull()
		}
	})

	test('knows suffixes added long after the list was first written', () => {
		expect(publicSuffix('x.example.kids')).toBe('kids')
		expect(publicSuffix('y.example.music')).toBe('music')
		expect(publicSuffix('z.example.xn--qxam')).toBe('xn--qxam')
	})
})

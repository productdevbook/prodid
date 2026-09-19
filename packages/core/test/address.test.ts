import { describe, expect, test } from 'bun:test'

import { classifyAddress, isPublicAddress, parseIpv6 } from '../src/address'

describe('classifyAddress', () => {
	test('names the IPv4 ranges a crawler must refuse', () => {
		expect(classifyAddress('0.0.0.0')).toBe('unspecified')
		expect(classifyAddress('127.0.0.1')).toBe('loopback')
		expect(classifyAddress('10.0.0.1')).toBe('private')
		expect(classifyAddress('172.16.0.1')).toBe('private')
		expect(classifyAddress('172.32.0.1')).toBe('public')
		expect(classifyAddress('192.168.1.1')).toBe('private')
		expect(classifyAddress('169.254.169.254')).toBe('link-local')
		expect(classifyAddress('100.64.0.1')).toBe('cgnat')
		expect(classifyAddress('224.0.0.1')).toBe('multicast')
		expect(classifyAddress('255.255.255.255')).toBe('reserved')
		expect(classifyAddress('198.51.100.7')).toBe('reserved')
	})

	test('names the IPv6 ranges a crawler must refuse', () => {
		expect(classifyAddress('::')).toBe('unspecified')
		expect(classifyAddress('::1')).toBe('loopback')
		expect(classifyAddress('[::1]')).toBe('loopback')
		expect(classifyAddress('fe80::1')).toBe('link-local')
		expect(classifyAddress('fe80::1%eth0')).toBe('link-local')
		expect(classifyAddress('fc00::1')).toBe('unique-local')
		expect(classifyAddress('fd12:3456::1')).toBe('unique-local')
		expect(classifyAddress('ff02::1')).toBe('multicast')
		expect(classifyAddress('2001:db8::1')).toBe('reserved')
	})

	test('follows an IPv4-mapped IPv6 address to the address it carries', () => {
		expect(classifyAddress('::ffff:10.0.0.1')).toBe('private')
		expect(classifyAddress('::ffff:127.0.0.1')).toBe('loopback')
		expect(classifyAddress('::ffff:169.254.169.254')).toBe('link-local')
		expect(classifyAddress('::ffff:0a00:0001')).toBe('private')
		expect(classifyAddress('::ffff:8.8.8.8')).toBe('public')
	})

	test('accepts the addresses a crawler may talk to', () => {
		expect(classifyAddress('8.8.8.8')).toBe('public')
		expect(classifyAddress('2606:4700:4700::1111')).toBe('public')
		expect(isPublicAddress('1.1.1.1')).toBe(true)
		expect(isPublicAddress('192.168.0.1')).toBe(false)
		expect(isPublicAddress('acme.example')).toBe(false)
	})

	test('reports anything that is not an address as invalid', () => {
		for (const value of ['', 'acme.example', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-1', 'g::1', '1::2::3', 'fe80:::1']) {
			expect(classifyAddress(value)).toBe('invalid')
		}
	})
})

describe('parseIpv6', () => {
	test('expands the compressed form', () => {
		expect([...parseIpv6('::1')!]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
		expect([...parseIpv6('2001:db8::1')!.subarray(0, 4)]).toEqual([0x20, 0x01, 0x0d, 0xb8])
		expect(parseIpv6('1:2:3:4:5:6:7:8')).not.toBeNull()
		expect(parseIpv6('1:2:3:4:5:6:7')).toBeNull()
		expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull()
		expect(parseIpv6('1:2:3:4:5:6:7:8::9')).toBeNull()
	})

	test('reads an embedded IPv4 address only in the last position', () => {
		expect([...parseIpv6('::ffff:1.2.3.4')!.subarray(10)]).toEqual([0xff, 0xff, 1, 2, 3, 4])
		expect(parseIpv6('::1.2.3.4:ffff')).toBeNull()
	})
})

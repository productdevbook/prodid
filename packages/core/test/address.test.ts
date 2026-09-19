import { describe, expect, test } from 'bun:test'

import { type AddressClass, classifyAddress, isPublicAddress, parseIpv6 } from '../src/address'

/** IANA's IPv4 Special-Purpose Address Registry, one address inside each block. */
const IPV4_REGISTRY: [address: string, kind: AddressClass][] = [
	['0.0.0.0', 'unspecified'],
	['0.1.2.3', 'reserved'],
	['10.0.0.1', 'private'],
	['100.64.0.1', 'cgnat'],
	['127.0.0.1', 'loopback'],
	['169.254.169.254', 'link-local'],
	['172.16.0.1', 'private'],
	['172.31.255.254', 'private'],
	['192.0.0.1', 'reserved'],
	['192.0.0.8', 'reserved'],
	['192.0.0.9', 'reserved'],
	['192.0.0.10', 'reserved'],
	['192.0.0.170', 'reserved'],
	['192.0.2.1', 'reserved'],
	['192.31.196.1', 'reserved'],
	['192.52.193.1', 'reserved'],
	['192.88.99.1', 'reserved'],
	['192.168.1.1', 'private'],
	['192.175.48.1', 'reserved'],
	['198.18.0.1', 'reserved'],
	['198.19.255.254', 'reserved'],
	['198.51.100.1', 'reserved'],
	['203.0.113.1', 'reserved'],
	['224.0.0.1', 'multicast'],
	['239.255.255.255', 'multicast'],
	['240.0.0.1', 'reserved'],
	['255.255.255.255', 'reserved'],
]

/** IANA's IPv6 Special-Purpose Address Registry, one address inside each block. */
const IPV6_REGISTRY: [address: string, kind: AddressClass][] = [
	['::1', 'loopback'],
	['::', 'unspecified'],
	['::ffff:8.8.8.8', 'public'],
	['64:ff9b::8.8.8.8', 'public'],
	['64:ff9b:1::1', 'reserved'],
	['100::1', 'reserved'],
	['100:0:0:1::1', 'reserved'],
	['2001::1', 'reserved'],
	['2001:1::1', 'reserved'],
	['2001:1::2', 'reserved'],
	['2001:1::3', 'reserved'],
	['2001:2::1', 'reserved'],
	['2001:3::1', 'reserved'],
	['2001:4:112::1', 'reserved'],
	['2001:10::1', 'reserved'],
	['2001:20::1', 'reserved'],
	['2001:30::1', 'reserved'],
	['2001:db8::1', 'reserved'],
	['2002:0808:0808::', 'public'],
	['2620:4f:8000::1', 'reserved'],
	['3fff::1', 'reserved'],
	['5f00::1', 'reserved'],
	['fc00::1', 'unique-local'],
	['fd12:3456::1', 'unique-local'],
	['fe80::1', 'link-local'],
	['ff02::1', 'multicast'],
]

describe('classifyAddress', () => {
	test.each(IPV4_REGISTRY)('classifies the IPv4 block holding %s as %s', (address, kind) => {
		expect(classifyAddress(address)).toBe(kind)
	})

	test.each(IPV6_REGISTRY)('classifies the IPv6 block holding %s as %s', (address, kind) => {
		expect(classifyAddress(address)).toBe(kind)
	})

	test('accepts the addresses a crawler may talk to', () => {
		expect(classifyAddress('8.8.8.8')).toBe('public')
		expect(classifyAddress('172.32.0.1')).toBe('public')
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

describe('an IPv6 address that wraps an IPv4 address is that address', () => {
	// Each of these said "public" before, which is a crawler pointed at a metadata service.
	const wrapped: [address: string, kind: AddressClass][] = [
		['::ffff:127.0.0.1', 'loopback'],
		['::ffff:10.0.0.1', 'private'],
		['::ffff:169.254.169.254', 'link-local'],
		['::ffff:0a00:0001', 'private'],
		['::ffff:0:127.0.0.1', 'loopback'],
		['::ffff:0:169.254.169.254', 'link-local'],
		['::127.0.0.1', 'loopback'],
		['::10.0.0.1', 'private'],
		['64:ff9b::127.0.0.1', 'loopback'],
		['64:ff9b::169.254.169.254', 'link-local'],
		['64:ff9b::a00:1', 'private'],
		['2002:7f00:0001::', 'loopback'],
		['2002:0a00:0001::1', 'private'],
		['2002:a9fe:a9fe::', 'link-local'],
		['2002:c0a8:0101::', 'private'],
	]

	test.each(wrapped)('%s is %s', (address, kind) => {
		expect(classifyAddress(address)).toBe(kind)
		expect(isPublicAddress(address)).toBe(false)
	})

	test('Teredo, documentation, discard-only and ORCHID are never public', () => {
		for (const address of ['2001::1', '2001:0:53aa:64c:0:7f00:1:2', '2001:db8::1', '3fff::1', '100::1', '2001:10::1', '2001:20::1']) {
			expect(isPublicAddress(address)).toBe(false)
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

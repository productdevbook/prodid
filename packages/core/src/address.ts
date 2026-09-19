export type AddressClass =
	| 'public'
	| 'invalid'
	| 'unspecified'
	| 'loopback'
	| 'private'
	| 'link-local'
	| 'cgnat'
	| 'unique-local'
	| 'multicast'
	| 'reserved'

const IPV4 = /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i

/** True only for addresses a crawler may talk to: everything else is someone's private network. */
export function isPublicAddress(address: string): boolean {
	return classifyAddress(address) === 'public'
}

/** Classifies an IPv4 or IPv6 address, following an IPv4-mapped IPv6 address to the address it carries. */
export function classifyAddress(address: string): AddressClass {
	const value = address.trim()
	if (value.includes(':')) {
		const bytes = parseIpv6(value)
		return bytes === null ? 'invalid' : classifyIpv6(bytes)
	}
	const packed = parseIpv4(value)
	return packed === null ? 'invalid' : classifyIpv4(packed)
}

export function parseIpv4(value: string): number | null {
	if (!IPV4.test(value)) return null
	let packed = 0
	for (const part of value.split('.')) {
		const octet = Number(part)
		if (octet > 255) return null
		packed = (packed << 8) | octet
	}
	return packed >>> 0
}

export function parseIpv6(value: string): Uint8Array | null {
	let text = value
	if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
	const zone = text.indexOf('%')
	if (zone !== -1) text = text.slice(0, zone)
	if (!text.includes(':')) return null

	const sides = text.split('::')
	if (sides.length > 2) return null
	const head = readGroups(sides[0]!)
	const tail = sides.length === 2 ? readGroups(sides[1]!) : null
	if (head === null || (sides.length === 2 && tail === null)) return null

	// `::` has to stand for at least one group of zeros, so a compressed address carries at most seven.
	const written = head.length + (tail?.length ?? 0)
	if (tail === null ? written !== 8 : written > 7) return null
	const groups = tail === null ? head : [...head, ...Array.from({ length: 8 - written }, () => 0), ...tail]

	const bytes = new Uint8Array(16)
	for (let i = 0; i < 8; i += 1) {
		bytes[i * 2] = (groups[i]! >>> 8) & 0xff
		bytes[i * 2 + 1] = groups[i]! & 0xff
	}
	return bytes
}

function readGroups(side: string): number[] | null {
	if (side === '') return []
	const items = side.split(':')
	const groups: number[] = []
	for (let i = 0; i < items.length; i += 1) {
		const item = items[i]!
		if (item.includes('.')) {
			const packed = parseIpv4(item)
			if (packed === null || i !== items.length - 1) return null
			groups.push((packed >>> 16) & 0xffff, packed & 0xffff)
			continue
		}
		if (!IPV6_GROUP.test(item)) return null
		groups.push(Number.parseInt(item, 16))
	}
	return groups
}

function classifyIpv4(packed: number): AddressClass {
	const inRange = (prefix: string, bits: number): boolean => {
		const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
		return (packed & mask) >>> 0 === (parseIpv4(prefix)! & mask) >>> 0
	}
	if (packed === 0) return 'unspecified'
	if (inRange('127.0.0.0', 8)) return 'loopback'
	if (inRange('10.0.0.0', 8) || inRange('172.16.0.0', 12) || inRange('192.168.0.0', 16)) return 'private'
	if (inRange('169.254.0.0', 16)) return 'link-local'
	if (inRange('100.64.0.0', 10)) return 'cgnat'
	if (inRange('224.0.0.0', 4)) return 'multicast'
	if (inRange('0.0.0.0', 8) || inRange('240.0.0.0', 4)) return 'reserved'
	if (inRange('192.0.0.0', 24) || inRange('192.0.2.0', 24) || inRange('198.18.0.0', 15)) return 'reserved'
	if (inRange('198.51.100.0', 24) || inRange('203.0.113.0', 24)) return 'reserved'
	return 'public'
}

function classifyIpv6(bytes: Uint8Array): AddressClass {
	const leading = (count: number): boolean => bytes.subarray(0, count).every((byte) => byte === 0)
	if (leading(16)) return 'unspecified'
	if (leading(15) && bytes[15] === 1) return 'loopback'
	if (leading(10) && bytes[10] === 0xff && bytes[11] === 0xff) {
		return classifyIpv4(((bytes[12]! << 24) | (bytes[13]! << 16) | (bytes[14]! << 8) | bytes[15]!) >>> 0)
	}
	if (leading(12)) return 'reserved'
	if (bytes[0] === 0xff) return 'multicast'
	if ((bytes[0]! & 0xfe) === 0xfc) return 'unique-local'
	if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return 'link-local'
	if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0) return 'reserved'
	if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return 'reserved'
	return 'public'
}

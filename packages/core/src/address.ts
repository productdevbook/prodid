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

interface Block {
	bits: number
	kind: AddressClass
}

interface Ipv4Block extends Block {
	packed: number
}

interface Ipv6Block extends Block {
	bytes: Uint8Array
}

const IPV4_TEXT = /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i

/**
 * IANA's IPv4 Special-Purpose Address Registry, plus multicast. Every registered block is non-public,
 * the few marked globally reachable included: no publisher serves a discovery document from one.
 */
const IPV4_BLOCKS: Ipv4Block[] = ipv4Blocks([
	['0.0.0.0', 8, 'reserved'],
	['10.0.0.0', 8, 'private'],
	['100.64.0.0', 10, 'cgnat'],
	['127.0.0.0', 8, 'loopback'],
	['169.254.0.0', 16, 'link-local'],
	['172.16.0.0', 12, 'private'],
	['192.0.0.0', 24, 'reserved'],
	['192.0.2.0', 24, 'reserved'],
	['192.31.196.0', 24, 'reserved'],
	['192.52.193.0', 24, 'reserved'],
	['192.88.99.0', 24, 'reserved'],
	['192.168.0.0', 16, 'private'],
	['192.175.48.0', 24, 'reserved'],
	['198.18.0.0', 15, 'reserved'],
	['198.51.100.0', 24, 'reserved'],
	['203.0.113.0', 24, 'reserved'],
	['224.0.0.0', 4, 'multicast'],
	['240.0.0.0', 4, 'reserved'],
])

/**
 * IANA's IPv6 Special-Purpose Address Registry. The forms that wrap an IPv4 address are resolved
 * before this table and classified by the address they carry. `2001::/23` is the IETF assignments
 * block, which covers Teredo, benchmarking, ORCHID and the anycast addresses inside it.
 * `64:ff9b:1::/48` is local-use translation whose embedded address cannot be located without knowing
 * the operator's prefix length, so the whole block is non-public rather than guessed at.
 */
const IPV6_BLOCKS: Ipv6Block[] = ipv6Blocks([
	['64:ff9b:1::', 48, 'reserved'],
	['100::', 64, 'reserved'],
	['100:0:0:1::', 64, 'reserved'],
	['2001::', 23, 'reserved'],
	['2001:db8::', 32, 'reserved'],
	['2620:4f:8000::', 48, 'reserved'],
	['3fff::', 20, 'reserved'],
	['5f00::', 16, 'reserved'],
	['fc00::', 7, 'unique-local'],
	['fe80::', 10, 'link-local'],
	['fec0::', 10, 'reserved'],
	['ff00::', 8, 'multicast'],
])

const NAT64_WELL_KNOWN = ipv6Blocks([['64:ff9b::', 96, 'reserved']])[0]!

/** True only for addresses a crawler may talk to: everything else is someone's private network. */
export function isPublicAddress(address: string): boolean {
	return classifyAddress(address) === 'public'
}

/** Classifies an IPv4 or IPv6 address, following any embedded IPv4 address to what it really names. */
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
	if (!IPV4_TEXT.test(value)) return null
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
	if (packed === 0) return 'unspecified'
	for (const block of IPV4_BLOCKS) {
		if (matchesIpv4(packed, block)) return block.kind
	}
	return 'public'
}

function classifyIpv6(bytes: Uint8Array): AddressClass {
	if (zeros(bytes, 16)) return 'unspecified'
	if (zeros(bytes, 15) && bytes[15] === 1) return 'loopback'

	const embedded = embeddedIpv4(bytes)
	if (embedded !== null) return classifyIpv4(embedded)

	for (const block of IPV6_BLOCKS) {
		if (matchesIpv6(bytes, block)) return block.kind
	}
	return 'public'
}

/**
 * The IPv4 address an IPv6 address carries, for every form that carries one: IPv4-mapped,
 * IPv4-translated, the deprecated IPv4-compatible, the well-known NAT64 prefix and 6to4. Whatever is
 * reachable through one of these is really the embedded address, so that is what decides.
 */
function embeddedIpv4(bytes: Uint8Array): number | null {
	if (zeros(bytes, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return packIpv4(bytes, 12)
	if (zeros(bytes, 8) && bytes[8] === 0xff && bytes[9] === 0xff && bytes[10] === 0 && bytes[11] === 0) return packIpv4(bytes, 12)
	if (zeros(bytes, 12)) return packIpv4(bytes, 12)
	if (matchesIpv6(bytes, NAT64_WELL_KNOWN)) return packIpv4(bytes, 12)
	if (bytes[0] === 0x20 && bytes[1] === 0x02) return packIpv4(bytes, 2)
	return null
}

function packIpv4(bytes: Uint8Array, offset: number): number {
	return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
}

function zeros(bytes: Uint8Array, count: number): boolean {
	return bytes.subarray(0, count).every((byte) => byte === 0)
}

function matchesIpv4(packed: number, block: Ipv4Block): boolean {
	const mask = block.bits === 0 ? 0 : (0xffffffff << (32 - block.bits)) >>> 0
	return (packed & mask) >>> 0 === (block.packed & mask) >>> 0
}

function matchesIpv6(bytes: Uint8Array, block: Ipv6Block): boolean {
	const whole = block.bits >> 3
	for (let i = 0; i < whole; i += 1) {
		if (bytes[i] !== block.bytes[i]) return false
	}
	const rest = block.bits & 7
	if (rest === 0) return true
	const mask = (0xff << (8 - rest)) & 0xff
	return (bytes[whole]! & mask) === (block.bytes[whole]! & mask)
}

function ipv4Blocks(rows: [prefix: string, bits: number, kind: AddressClass][]): Ipv4Block[] {
	return rows.map(([prefix, bits, kind]) => ({ packed: parseIpv4(prefix)!, bits, kind }))
}

function ipv6Blocks(rows: [prefix: string, bits: number, kind: AddressClass][]): Ipv6Block[] {
	return rows.map(([prefix, bits, kind]) => ({ bytes: parseIpv6(prefix)!, bits, kind }))
}

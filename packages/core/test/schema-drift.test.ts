import { describe, expect, test } from 'bun:test'

import dumpSchema from '@prodid/spec/schemas/org.prodid.dump.json'
import entitySchema from '@prodid/spec/schemas/org.prodid.entity.json'
import feedSchema from '@prodid/spec/schemas/org.prodid.feed.json'
import itemSchema from '@prodid/spec/schemas/org.prodid.item.json'
import sourceSchema from '@prodid/spec/schemas/org.prodid.source.json'

import type {
	ClaimSource,
	CrawlStatus,
	DumpFile,
	DumpLicenses,
	DumpManifest,
	EntityClaim,
	EntityIdentifier,
	EntityRecord,
	FeedPublisher,
	FeedRecord,
	ItemRecord,
	MediaEntry,
	MediaValue,
	RecordIdentifier,
	SourceRecord,
} from '../src/record/index'

/**
 * A hand-written type and the schema it mirrors drift apart silently: a property added to the
 * schema still validates, and the type simply never mentions it, so callers cast around the gap.
 *
 * Each sample below is typed `Required<T>`, which makes TypeScript refuse the literal unless it
 * names every property of the type — including the optional ones — and refuse any property the type
 * does not have. The test then compares the sample's keys with the schema's own `properties` keys.
 * A property in the schema and not the type fails at runtime here; one in the type and not the
 * schema fails the same way; and writing the sample at all fails to compile if the two disagree.
 */
function drift(sample: object, properties: object): { missing: string[]; extra: string[] } {
	const declared = new Set(Object.keys(properties))
	const typed = new Set(Object.keys(sample))
	return {
		missing: [...declared].filter((key) => !typed.has(key)).sort(),
		extra: [...typed].filter((key) => !declared.has(key)).sort(),
	}
}

const item: Required<ItemRecord> = {
	$type: 'org.prodid.item',
	key: 'TB-100',
	brand: 'Acme',
	name: 'Trail Bottle 1L',
	lang: 'en',
	group: 'TB',
	variant: { color: 'navy' },
	identifiers: [{ scheme: 'gtin', value: '9506000134420' }],
	category: 'gpc:10000000',
	markets: ['TR'],
	properties: { madeIn: 'TR' },
	media: [{ url: 'https://acme.example/a.webp', license: 'CC0-1.0', kind: 'image' }],
}

const recordIdentifier: Required<RecordIdentifier> = { scheme: 'gtin', value: '9506000134420' }

const mediaEntry: Required<MediaEntry> = { url: 'https://acme.example/a.webp', license: 'CC0-1.0', kind: 'image' }

const feed: Required<FeedRecord> = {
	$type: 'org.prodid.feed',
	version: 0,
	domain: 'acme.example',
	publisher: { name: 'Acme Tekstil' },
	license: 'CC0-1.0',
	feeds: ['https://acme.example/items.ndjson'],
}

const publisher: Required<FeedPublisher> = { name: 'Acme Tekstil', contact: 'data@acme.example' }

const entity: Required<EntityRecord> = {
	$type: 'org.prodid.entity',
	opid: '3n7k2q9vdfhb4mta',
	kind: 'family',
	parents: { family: '9p2d4kv7mq3nbhxf', variant: 'kq7m3v9dn2hb4t5x' },
	children: ['9p2d4kv7mq3nbhxf'],
	merged_from: ['kq7m3v9dn2hb4t5x'],
	identifiers: [{ scheme: 'gtin', value: '09506000134420' }],
	claims: [],
}

const parents: Required<NonNullable<EntityRecord['parents']>> = { family: '9p2d4kv7mq3nbhxf', variant: 'kq7m3v9dn2hb4t5x' }

const entityIdentifier: Required<EntityIdentifier> = { scheme: 'mpn', value: 'TJ-1', scope: 'acme' }

const claim: Required<EntityClaim> = {
	property: 'name',
	value: 'Trail Jacket',
	lang: 'en',
	source: { name: 'acme.example', trust: 'verified', lapsed: false },
	seen_at: '2026-09-14T09:12:03Z',
	withdrawn_at: '2026-09-15T09:12:03Z',
}

const mediaValue: Required<MediaValue> = {
	sha256: 'e3943ea26ce08ae81809e62936dc4f934fa04da6cd57bd9ab2a90b79da751c09',
	url: 'https://acme.example/a.webp',
	media_url: 'https://media.prodid.org/sha256/e3943ea26ce08ae81809e62936dc4f934fa04da6cd57bd9ab2a90b79da751c09',
	license: 'CC0-1.0',
	kind: 'image',
}

const claimSource: Required<ClaimSource> = { name: 'acme.example', trust: 'verified', lapsed: false }

const source: Required<SourceRecord> = {
	$type: 'org.prodid.source',
	name: 'acme.example',
	kind: 'domain',
	trust: 'verified',
	verified_by: 'dns-txt',
	verified_at: '2026-09-14T09:12:03Z',
	lapsed: false,
	lapsed_at: '2026-09-15T09:12:03Z',
	license: 'CC0-1.0',
	last_crawl: { at: '2026-09-14T09:12:03Z', outcome: 'success' },
}

const crawl: Required<CrawlStatus> = {
	at: '2026-09-14T09:12:03Z',
	via: 'dns-txt',
	document_url: 'https://acme.example/.well-known/prodid.json',
	outcome: 'success',
	http_status: 200,
	records_seen: 3,
	records_changed: 1,
	lines_skipped: 0,
	media_failed: 0,
	feeds_failed: 0,
}

const dumpFile: Required<DumpFile> = {
	name: 'sources.ndjson.gz',
	sha256: '4f1c2a9e8b7d6c5e0f3a2b1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e',
	bytes: 18233,
	lines: 412,
}

const dumpLicenses: Required<DumpLicenses> = { index: 'CC0-1.0', claims: 'source' }

const dump: Required<DumpManifest> = {
	$type: 'org.prodid.dump',
	version: 0,
	created_at: '2026-11-02T04:41:27Z',
	snapshot_at: '2026-11-02T04:30:02Z',
	files: [dumpFile],
	licenses: dumpLicenses,
}

const MIRRORS: { name: string; sample: object; properties: object }[] = [
	{ name: 'ItemRecord', sample: item, properties: itemSchema.properties },
	{ name: 'RecordIdentifier', sample: recordIdentifier, properties: itemSchema.$defs.identifier.properties },
	{ name: 'MediaEntry', sample: mediaEntry, properties: itemSchema.$defs.media.properties },
	{ name: 'FeedRecord', sample: feed, properties: feedSchema.properties },
	{ name: 'FeedPublisher', sample: publisher, properties: feedSchema.properties.publisher.properties },
	{ name: 'EntityRecord', sample: entity, properties: entitySchema.properties },
	{ name: 'EntityRecord.parents', sample: parents, properties: entitySchema.properties.parents.properties },
	{ name: 'EntityIdentifier', sample: entityIdentifier, properties: entitySchema.$defs.identifier.properties },
	{ name: 'EntityClaim', sample: claim, properties: entitySchema.$defs.claim.properties },
	{ name: 'MediaValue', sample: mediaValue, properties: entitySchema.$defs.mediaValue.properties },
	{ name: 'ClaimSource', sample: claimSource, properties: entitySchema.$defs.source.properties },
	{ name: 'SourceRecord', sample: source, properties: sourceSchema.properties },
	{ name: 'CrawlStatus', sample: crawl, properties: sourceSchema.$defs.crawl.properties },
	{ name: 'DumpManifest', sample: dump, properties: dumpSchema.properties },
	{ name: 'DumpFile', sample: dumpFile, properties: dumpSchema.$defs.file.properties },
	{ name: 'DumpLicenses', sample: dumpLicenses, properties: dumpSchema.properties.licenses.properties },
]

describe('the exported types name exactly what the schemas declare', () => {
	test('every type mirrors its schema, property for property', () => {
		expect(MIRRORS.length).toBeGreaterThan(0)
		for (const { name, sample, properties } of MIRRORS) {
			const { missing, extra } = drift(sample, properties)
			if (missing.length > 0) throw new Error(`${name} is missing ${missing.join(', ')}, which the schema declares`)
			if (extra.length > 0) throw new Error(`${name} has ${extra.join(', ')}, which the schema does not declare`)
		}
	})

	test('catches a property the schema declares and the type forgot', () => {
		// What CrawlStatus looked like before feeds_failed: the shape edge had to cast around.
		const { feeds_failed: _dropped, ...stale } = crawl
		expect(drift(stale, sourceSchema.$defs.crawl.properties)).toEqual({ missing: ['feeds_failed'], extra: [] })
	})

	test('catches a property the type has and the schema does not', () => {
		expect(drift({ ...crawl, invented: 1 }, sourceSchema.$defs.crawl.properties)).toEqual({ missing: [], extra: ['invented'] })
	})
})

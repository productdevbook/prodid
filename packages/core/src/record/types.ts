import type { JsonValue } from '../canonical'

/** The specification version a document carries in `version`. */
export type SpecVersion = 0 | 1

export type Trust = 'authoritative' | 'verified' | 'unverified'
export type VerifiedBy = 'well-known' | 'dns-txt'
export type CrawlVia = VerifiedBy | 'import'
export type EntityKind = 'family' | 'variant' | 'item'
export type SourceKind = 'domain' | 'hosted' | 'dataset' | 'community'
export type CrawlOutcome = 'success' | 'definite-negative' | 'transport-failure'

export interface RecordIdentifier {
	scheme: string
	value: string
}

export type PropertyValue = string | number | boolean | string[] | { value: number; unit: string }

export interface MediaEntry {
	url: string
	license: string
	kind?: 'image' | 'document'
}

export interface ItemRecord {
	$type: 'org.prodid.item'
	key: string
	brand: string
	name: string
	lang?: string
	group?: string
	variant?: Record<string, string>
	identifiers: RecordIdentifier[]
	category?: string
	markets?: string[]
	properties?: Record<string, PropertyValue>
	media?: MediaEntry[]
}

export interface FeedPublisher {
	name: string
	contact?: string
}

export interface FeedRecord {
	$type: 'org.prodid.feed'
	version: SpecVersion
	domain?: string
	publisher: FeedPublisher
	license: string
	feeds: string[]
}

export interface EntityIdentifier {
	scheme: string
	value: string
	scope?: string
}

export interface ClaimSource {
	name: string
	trust: Trust
	lapsed: boolean
}

/** The value of a `media` claim: what the index stored, not what the publisher wrote. */
export interface MediaValue {
	sha256: string
	url: string
	media_url: string
	license: string
	kind?: 'image' | 'document'
}

export interface EntityClaim {
	property: string
	value: JsonValue
	lang?: string
	source: ClaimSource
	seen_at: string
	withdrawn_at?: string
}

export interface EntityRecord {
	$type: 'org.prodid.entity'
	/** Absent in v0. */
	version?: 1
	opid: string
	kind: EntityKind
	parents?: { family?: string; variant?: string }
	children?: string[]
	merged_from?: string[]
	identifiers: EntityIdentifier[]
	claims: EntityClaim[]
}

export interface CrawlStatus {
	at: string
	via?: CrawlVia
	document_url?: string
	outcome: CrawlOutcome
	http_status?: number
	records_seen?: number
	records_changed?: number
	lines_skipped?: number
	media_failed?: number
	feeds_failed?: number
}

export interface SourceRecord {
	$type: 'org.prodid.source'
	/** Absent in v0. */
	version?: 1
	name: string
	kind: SourceKind
	trust: Trust
	verified_by?: VerifiedBy
	verified_at?: string
	lapsed: boolean
	lapsed_at?: string
	license?: string
	last_crawl?: CrawlStatus
}

export type DumpFileName = 'sources.ndjson.gz' | 'entities.ndjson.gz' | 'records.ndjson.gz' | 'groupings.ndjson.gz' | 'merges.ndjson.gz'

export interface DumpFile {
	name: DumpFileName
	sha256: string
	bytes: number
	lines: number
}

export interface DumpLicenses {
	index: 'CC0-1.0'
	claims: 'source'
}

export interface DumpManifest {
	$type: 'org.prodid.dump'
	version: SpecVersion
	created_at: string
	snapshot_at: string
	files: DumpFile[]
	licenses: DumpLicenses
}

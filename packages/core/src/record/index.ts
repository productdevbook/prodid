import { parseGtin } from '../gtin'
import { normalizeIdentifier } from '../identifier'
import type { DumpManifest, EntityClaim, EntityRecord, FeedRecord, ItemRecord, SourceRecord, SpecVersion } from './types'
import {
	dumpV0,
	dumpV1,
	entityV0,
	entityV1,
	feedV0,
	feedV1,
	item as itemSchema,
	type SchemaError,
	type SchemaValidator,
	sourceV0,
	sourceV1,
} from './validators.generated.js'

export type {
	ClaimSource,
	CrawlOutcome,
	CrawlStatus,
	CrawlVia,
	DumpFile,
	DumpFileName,
	DumpLicenses,
	DumpManifest,
	EntityClaim,
	EntityIdentifier,
	EntityKind,
	EntityRecord,
	FeedPublisher,
	FeedRecord,
	ItemRecord,
	MediaEntry,
	MediaValue,
	PropertyValue,
	RecordIdentifier,
	SourceKind,
	SourceRecord,
	SpecVersion,
	Trust,
	VerifiedBy,
} from './types'

export interface ValidationError {
	/** JSON Pointer into the value that was validated. */
	path: string
	keyword: string
	message: string
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] }

/**
 * Without `version`, the schema is the one the document's own `version` names: `0` or `1` for a
 * discovery document or a dump manifest, absent or `1` for an entity or a source status. Anything
 * else is checked against v1, the current version, and refused there.
 */
export interface ValidateOptions {
	version?: SpecVersion
}

const FEED: Record<SpecVersion, SchemaValidator<FeedRecord>> = { 0: feedV0, 1: feedV1 }
const ENTITY: Record<SpecVersion, SchemaValidator<EntityRecord>> = { 0: entityV0, 1: entityV1 }
const SOURCE: Record<SpecVersion, SchemaValidator<SourceRecord>> = { 0: sourceV0, 1: sourceV1 }
const DUMP: Record<SpecVersion, SchemaValidator<DumpManifest>> = { 0: dumpV0, 1: dumpV1 }

function declaredVersion(value: unknown): SpecVersion {
	return isObject(value) && value.version === 0 ? 0 : 1
}

function versionIfPresent(value: unknown): SpecVersion {
	return isObject(value) && Object.hasOwn(value, 'version') ? 1 : 0
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateItem(value: unknown): ValidationResult<ItemRecord> {
	const result = run(itemSchema, value)
	if (!result.ok) return result
	const errors = result.value.identifiers.flatMap((identifier, index) => {
		if (identifier.scheme !== 'gtin') return []
		const gtin = parseGtin(identifier.value)
		return gtin.ok ? [] : [{ path: `/identifiers/${index}/value`, keyword: 'gtin', message: `must be a GTIN (${gtin.problem})` }]
	})
	if (errors.length === 0 && !isIdentifiable(result.value)) {
		errors.push({ path: '/identifiers', keyword: 'identifiable', message: 'must keep one identifier the index can store' })
	}
	return errors.length === 0 ? result : { ok: false, errors }
}

/**
 * Whether anything is left to match on once the identifiers are normalized. An `mpn` whose brand
 * normalizes to nothing has no scope to be unique within, and a record with nothing usable would
 * mint a fresh entity on every crawl. The source id always exists at ingest, so `sku` and `rcn` are
 * asked only whether they would normalize at all.
 */
function isIdentifiable(record: ItemRecord): boolean {
	const scope = { brand: record.brand, sourceScope: '1' }
	return record.identifiers.some((identifier) => normalizeIdentifier(identifier, scope) !== null)
}

export function validateFeed(value: unknown, options: ValidateOptions = {}): ValidationResult<FeedRecord> {
	return run(FEED[options.version ?? declaredVersion(value)], value)
}

export function validateEntity(value: unknown, options: ValidateOptions = {}): ValidationResult<EntityRecord> {
	const result = run(ENTITY[options.version ?? versionIfPresent(value)], value)
	if (!result.ok) return result
	const errors = entityErrors(result.value)
	return errors.length === 0 ? result : { ok: false, errors }
}

/** The relations between an entity's own fields, which a schema cannot compare. */
function entityErrors(entity: EntityRecord): ValidationError[] {
	const errors: ValidationError[] = []
	const selfReference = (path: string): void => {
		errors.push({ path, keyword: 'self-reference', message: 'must not be the entity itself' })
	}
	if (entity.parents?.family === entity.opid) selfReference('/parents/family')
	if (entity.parents?.variant === entity.opid) selfReference('/parents/variant')
	entity.merged_from?.forEach((opid, index) => {
		if (opid === entity.opid) selfReference(`/merged_from/${index}`)
	})
	entity.children?.forEach((opid, index) => {
		if (opid === entity.opid) selfReference(`/children/${index}`)
	})

	entity.claims.forEach((claim, index) => {
		if (claim.withdrawn_at !== undefined && Date.parse(claim.withdrawn_at) < Date.parse(claim.seen_at)) {
			errors.push({ path: `/claims/${index}/withdrawn_at`, keyword: 'order', message: 'must not be before seen_at' })
		}
		const media = mediaValue(claim)
		if (media !== null && !media.media_url.endsWith(`/${media.sha256}`)) {
			errors.push({ path: `/claims/${index}/value/media_url`, keyword: 'digest', message: 'must serve the digest the claim names' })
		}
	})
	return errors
}

function mediaValue(claim: EntityClaim): { sha256: string; media_url: string } | null {
	if (claim.property !== 'media' || typeof claim.value !== 'object' || claim.value === null || Array.isArray(claim.value)) return null
	const { sha256, media_url: mediaUrl } = claim.value
	return typeof sha256 === 'string' && typeof mediaUrl === 'string' ? { sha256, media_url: mediaUrl } : null
}

export function validateSource(value: unknown, options: ValidateOptions = {}): ValidationResult<SourceRecord> {
	return run(SOURCE[options.version ?? versionIfPresent(value)], value)
}

export function validateDump(value: unknown, options: ValidateOptions = {}): ValidationResult<DumpManifest> {
	const result = run(DUMP[options.version ?? declaredVersion(value)], value)
	if (!result.ok) return result
	if (Date.parse(result.value.snapshot_at) > Date.parse(result.value.created_at)) {
		return { ok: false, errors: [{ path: '/snapshot_at', keyword: 'order', message: 'must not be after created_at' }] }
	}
	return result
}

function run<T>(validate: SchemaValidator<T>, value: unknown): ValidationResult<T> {
	if (!validate(value)) return { ok: false, errors: (validate.errors ?? []).map(toValidationError) }
	const errors = unstorableStrings(value, '')
	return errors.length === 0 ? { ok: true, value } : { ok: false, errors }
}

/**
 * JSON Schema cannot say this and Postgres `jsonb` will not hold it: a lone surrogate has no
 * canonical form, and U+0000 cannot be stored at all. Reporting it as a validation error skips the
 * line instead of aborting the ingest at the database.
 */
function unstorableStrings(value: unknown, path: string): ValidationError[] {
	if (typeof value === 'string') return check(value, path, 'value')
	if (Array.isArray(value)) return value.flatMap((item, index) => unstorableStrings(item, `${path}/${index}`))
	if (typeof value !== 'object' || value === null) return []
	return Object.entries(value).flatMap(([key, member]) => {
		const at = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`
		return [...check(key, at, 'name'), ...unstorableStrings(member, at)]
	})
}

function check(text: string, path: string, what: 'value' | 'name'): ValidationError[] {
	if (!text.isWellFormed()) {
		return [{ path: path === '' ? '/' : path, keyword: 'storable', message: `${what} must not contain an unpaired surrogate` }]
	}
	if (text.includes('\u0000')) {
		return [{ path: path === '' ? '/' : path, keyword: 'storable', message: `${what} must not contain U+0000` }]
	}
	return []
}

function toValidationError(error: SchemaError): ValidationError {
	return {
		path: error.instancePath === '' ? '/' : error.instancePath,
		keyword: error.keyword,
		message: error.message ?? `must satisfy ${error.keyword}`,
	}
}

import { parseGtin } from '../gtin'
import type { EntityRecord, FeedRecord, ItemRecord, SourceRecord } from './types'
import {
	entity as entitySchema,
	feed as feedSchema,
	item as itemSchema,
	type SchemaError,
	type SchemaValidator,
	source as sourceSchema,
} from './validators.generated.js'

export type {
	ClaimSource,
	CrawlOutcome,
	CrawlStatus,
	EntityClaim,
	EntityIdentifier,
	EntityKind,
	EntityRecord,
	FeedPublisher,
	FeedRecord,
	ItemRecord,
	MediaEntry,
	PropertyValue,
	RecordIdentifier,
	SourceKind,
	SourceRecord,
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

export function validateItem(value: unknown): ValidationResult<ItemRecord> {
	const result = run(itemSchema, value)
	if (!result.ok) return result
	const errors = result.value.identifiers.flatMap((identifier, index) => {
		if (identifier.scheme !== 'gtin') return []
		const gtin = parseGtin(identifier.value)
		return gtin.ok ? [] : [{ path: `/identifiers/${index}/value`, keyword: 'gtin', message: `must be a GTIN (${gtin.problem})` }]
	})
	return errors.length === 0 ? result : { ok: false, errors }
}

export function validateFeed(value: unknown): ValidationResult<FeedRecord> {
	return run(feedSchema, value)
}

export function validateEntity(value: unknown): ValidationResult<EntityRecord> {
	return run(entitySchema, value)
}

export function validateSource(value: unknown): ValidationResult<SourceRecord> {
	return run(sourceSchema, value)
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

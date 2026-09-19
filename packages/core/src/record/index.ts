import type { FeedRecord, ItemRecord } from './types'
import { feed as feedSchema, item as itemSchema, type SchemaError, type SchemaValidator } from './validators.generated.js'

export type { FeedPublisher, FeedRecord, ItemRecord, MediaEntry, PropertyValue, RecordIdentifier } from './types'

export interface ValidationError {
	/** JSON Pointer into the value that was validated. */
	path: string
	keyword: string
	message: string
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] }

export function validateItem(value: unknown): ValidationResult<ItemRecord> {
	return run(itemSchema, value)
}

export function validateFeed(value: unknown): ValidationResult<FeedRecord> {
	return run(feedSchema, value)
}

function run<T>(validate: SchemaValidator<T>, value: unknown): ValidationResult<T> {
	if (validate(value)) return { ok: true, value }
	return { ok: false, errors: (validate.errors ?? []).map(toValidationError) }
}

function toValidationError(error: SchemaError): ValidationError {
	return {
		path: error.instancePath === '' ? '/' : error.instancePath,
		keyword: error.keyword,
		message: error.message ?? `must satisfy ${error.keyword}`,
	}
}

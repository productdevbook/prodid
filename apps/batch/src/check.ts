import { readNdjson, validateEntity, validateFeed, validateItem, validateSource, type ValidationResult } from '@prodid/core'

/** The crawler's cap on one feed line; a longer line is skipped, so it is reported here. */
export const MAX_LINE_BYTES = 65_536

export interface CheckProblem {
	/** The feed line the problem is on, or null for a single JSON document. */
	line: number | null
	message: string
}

export interface CheckResult {
	records: number
	problems: CheckProblem[]
}

const DOCUMENTS: Record<string, (value: unknown) => ValidationResult<unknown>> = {
	'org.prodid.feed': validateFeed,
	'org.prodid.item': validateItem,
	'org.prodid.entity': validateEntity,
	'org.prodid.source': validateSource,
}

/** Every line is read as the crawler reads it: an `org.prodid.item`, or a line it skips. */
export async function checkFeed(stream: ReadableStream<Uint8Array>): Promise<CheckResult> {
	const problems: CheckProblem[] = []
	let records = 0
	for await (const entry of readNdjson(stream, { maxLineBytes: MAX_LINE_BYTES })) {
		if (!entry.ok) {
			problems.push({ line: entry.line, message: entry.error })
			continue
		}
		const before = problems.length
		validationProblems(validateItem(entry.value), entry.line, problems)
		if (problems.length === before) records++
	}
	return { records, problems }
}

/** A discovery document, or any other single record the spec defines, picked by its `$type`. */
export function checkDocument(text: string): CheckResult {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch (error) {
		return { records: 0, problems: [{ line: null, message: error instanceof Error ? error.message : String(error) }] }
	}
	const type = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as { $type?: unknown }).$type : undefined
	const validate = typeof type === 'string' ? DOCUMENTS[type] : undefined
	if (validate === undefined) {
		return { records: 0, problems: [{ line: null, message: `/$type must be one of ${Object.keys(DOCUMENTS).join(', ')}` }] }
	}
	const problems: CheckProblem[] = []
	validationProblems(validate(value), null, problems)
	return { records: problems.length === 0 ? 1 : 0, problems }
}

export function formatProblem(file: string, problem: CheckProblem): string {
	return problem.line === null ? `${file}: ${problem.message}` : `${file}:${problem.line}: ${problem.message}`
}

function validationProblems(result: ValidationResult<unknown>, line: number | null, into: CheckProblem[]): void {
	if (result.ok) return
	if (result.errors.length === 0) into.push({ line, message: '/ is not valid' })
	for (const error of result.errors) into.push({ line, message: `${error.path} ${error.message}` })
}

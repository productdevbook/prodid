import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import addFormats from 'ajv-formats'
import Ajv2020, { type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020'

type Defect = { instancePath: string; keyword: string }

const root = import.meta.dir
const ajv = new Ajv2020({ strict: true, allErrors: true })
addFormats(ajv)

const schemas = new Map<string, AnySchemaObject>()
const validators = new Map<string, ValidateFunction>()
for (const name of jsonFiles(join(root, 'schemas'))) {
	const schema = JSON.parse(readFileSync(join(root, 'schemas', name), 'utf8')) as AnySchemaObject
	const type: unknown = schema.properties?.$type?.const
	if (typeof type !== 'string') throw new Error(`${name}: no $type const`)
	schemas.set(type, schema)
	validators.set(type, ajv.compile(schema))
}

const expected = JSON.parse(readFileSync(join(root, 'fixtures', 'expected.json'), 'utf8')) as Record<string, Defect>
const hostPattern = String(schemas.get('org.prodid.feed')?.properties.domain.pattern).replace(/^\^/, '').replace(/\$$/, '')
const feedUrlPattern = new RegExp(`^https://${hostPattern}/\\.well-known/prodid\\.json$`)

let failures = 0
const asserted = new Set<string>()

for (const name of readdirSync(join(root, 'examples')).sort()) {
	const path = join(root, 'examples', name)
	if (name.endsWith('.ndjson')) report(path, checkNdjson(path))
	else if (name.endsWith('.json')) report(path, checkFile(path, true))
}
for (const name of jsonFiles(join(root, 'fixtures', 'valid'))) {
	report(join(root, 'fixtures', 'valid', name), checkFile(join(root, 'fixtures', 'valid', name), true))
}
for (const name of jsonFiles(join(root, 'fixtures', 'invalid'))) {
	report(join(root, 'fixtures', 'invalid', name), checkInvalidFixture(join(root, 'fixtures', 'invalid', name), name))
}
for (const name of jsonFiles(join(root, 'fixtures', 'txt'))) {
	report(join(root, 'fixtures', 'txt', name), checkTxtVector(join(root, 'fixtures', 'txt', name)))
}
report(
	join(root, 'fixtures', 'expected.json'),
	Object.keys(expected)
		.filter((name) => !asserted.has(name))
		.map((name) => `no fixture named ${name}`),
)

process.exit(failures === 0 ? 0 : 1)

function jsonFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith('.json'))
		.sort()
}

function parse(text: string): { value: unknown } | { problem: string } {
	try {
		return { value: JSON.parse(text) as unknown }
	} catch (error) {
		return { problem: `not JSON: ${(error as Error).message}` }
	}
}

function checkFile(path: string, expectValid: boolean): string[] {
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return expectValid ? [parsed.problem] : []
	return checkRecord(parsed.value, expectValid)
}

function checkRecord(record: unknown, expectValid: boolean): string[] {
	const validate = validatorFor(record)
	if (typeof validate === 'string') return expectValid ? [validate] : []
	if (validate(record)) return expectValid ? [] : ['accepted, but must be rejected']
	return expectValid ? [errorText(validate)] : []
}

function validatorFor(record: unknown): ValidateFunction | string {
	const type = (record as { $type?: unknown } | null)?.$type
	if (typeof type !== 'string') return 'no $type'
	const validate = validators.get(type)
	return validate ?? `unknown $type ${type}`
}

function checkNdjson(path: string): string[] {
	const lines = readFileSync(path, 'utf8').split('\n')
	const problems: string[] = []
	lines.forEach((line, index) => {
		const at = `line ${index + 1}`
		if (line.trim() === '') {
			if (index !== lines.length - 1) problems.push(`${at}: empty`)
			return
		}
		const parsed = parse(line)
		if ('problem' in parsed) {
			problems.push(`${at}: ${parsed.problem}`)
			return
		}
		for (const problem of checkRecord(parsed.value, true)) problems.push(`${at}: ${problem}`)
	})
	return problems
}

function checkInvalidFixture(path: string, name: string): string[] {
	asserted.add(name)
	const defect = expected[name]
	if (!defect) return ['no expected defect in fixtures/expected.json']
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	const validate = validatorFor(parsed.value)
	if (typeof validate === 'string') return [validate]
	if (validate(parsed.value)) return ['accepted, but must be rejected']
	const wanted = (validate.errors ?? []).some((error) => error.instancePath === defect.instancePath && error.keyword === defect.keyword)
	if (wanted) return []
	return [`rejected by ${errorText(validate)}, expected ${defect.keyword} at ${defect.instancePath || '/'}`]
}

function checkTxtVector(path: string): string[] {
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	const vector = parsed.value as Record<string, unknown>
	if (typeof vector !== 'object' || vector === null || Array.isArray(vector)) return ['not an object']
	const problems: string[] = []
	for (const key of Object.keys(vector)) {
		if (key !== 'value' && key !== 'valid' && key !== 'feed') problems.push(`unknown field ${key}`)
	}
	const value = vector.value
	if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== 'string')) {
		problems.push('value must be a non-empty array of strings')
	} else if (Buffer.byteLength(value.join(''), 'utf8') > 512) {
		problems.push('value is longer than 512 bytes')
	} else if (value.some((part) => Buffer.byteLength(part as string, 'utf8') > 255)) {
		problems.push('a character-string is longer than 255 bytes')
	}
	if (typeof vector.valid !== 'boolean') problems.push('valid must be a boolean')
	if (vector.valid === true && typeof vector.feed !== 'string') problems.push('a valid vector must state its feed')
	if (vector.valid === false && 'feed' in vector) problems.push('an invalid vector must not state a feed')
	if (typeof vector.feed === 'string' && !feedUrlPattern.test(vector.feed)) problems.push(`feed is not a delegation target: ${vector.feed}`)
	return problems
}

function errorText(validate: ValidateFunction): string {
	return (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
}

function report(path: string, problems: string[]): void {
	const name = relative(root, path)
	if (problems.length === 0) {
		console.log(`ok    ${name}`)
		return
	}
	failures += 1
	console.log(`FAIL  ${name}: ${problems.join(' | ')}`)
}

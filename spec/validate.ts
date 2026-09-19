import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import addFormats from 'ajv-formats'
import Ajv2020, { type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020'

type Defect = { instancePath: string; keyword: string; params?: Record<string, unknown> }
type Problem = { instancePath: string; keyword: string; params: Record<string, unknown>; message: string }
type TxtOutcome = 'delegation' | 'ignored' | 'malformed'
type TxtResult = { outcome: TxtOutcome; host?: string }

const MAX_TXT_BYTES = 512
const MAX_CHARACTER_STRING_BYTES = 255
const TXT_VERSION = 'prodid0'
const TAG_NAME = /^[a-z][a-z0-9-]*$/
const TAG_VALUE = /^[!-:<-~]*$/

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
const ndjsonExpected = JSON.parse(readFileSync(join(root, 'fixtures', 'ndjson', 'expected.json'), 'utf8')) as Record<string, number[]>
const domainRule = schemas.get('org.prodid.feed')?.properties.domain as { pattern: string; maxLength: number }
const isHost = (value: string): boolean => new RegExp(domainRule.pattern).test(value) && bytes(value) <= domainRule.maxLength

let failures = 0
const asserted = new Set<string>()
const ndjsonAsserted = new Set<string>()

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
for (const name of jsonFiles(join(root, 'fixtures', 'brand'))) {
	report(join(root, 'fixtures', 'brand', name), checkBrandVector(join(root, 'fixtures', 'brand', name)))
}
for (const name of jsonFiles(join(root, 'fixtures', 'gtin'))) {
	report(join(root, 'fixtures', 'gtin', name), checkGtinVector(join(root, 'fixtures', 'gtin', name)))
}
for (const name of readdirSync(join(root, 'fixtures', 'ndjson')).sort()) {
	if (!name.endsWith('.ndjson')) continue
	report(join(root, 'fixtures', 'ndjson', name), checkNdjsonFixture(join(root, 'fixtures', 'ndjson', name), name))
}
report(
	join(root, 'fixtures', 'expected.json'),
	Object.keys(expected)
		.filter((name) => !asserted.has(name))
		.map((name) => `no fixture named ${name}`),
)
report(
	join(root, 'fixtures', 'ndjson', 'expected.json'),
	Object.keys(ndjsonExpected)
		.filter((name) => !ndjsonAsserted.has(name))
		.map((name) => `no fixture named ${name}`),
)

process.exit(failures === 0 ? 0 : 1)

function jsonFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith('.json'))
		.sort()
}

function bytes(value: string): number {
	return Buffer.byteLength(value, 'utf8')
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
	const problems = recordProblems(record)
	if (typeof problems === 'string') return expectValid ? [problems] : []
	if (problems.length === 0) return expectValid ? [] : ['accepted, but must be rejected']
	return expectValid ? [problemText(problems)] : []
}

function recordProblems(record: unknown): Problem[] | string {
	const type = (record as { $type?: unknown } | null)?.$type
	if (typeof type !== 'string') return 'no $type'
	const validate = validators.get(type)
	if (!validate) return `unknown $type ${type}`
	const problems: Problem[] = []
	if (!validate(record)) {
		for (const error of validate.errors ?? []) {
			problems.push({
				instancePath: error.instancePath,
				keyword: error.keyword,
				params: error.params as Record<string, unknown>,
				message: `${error.instancePath || '/'} ${error.message}`,
			})
		}
	}
	problems.push(...storabilityProblems(record, ''))
	if (type === 'org.prodid.item') problems.push(...gtinProblems(record), ...identifiableProblems(record))
	if (type === 'org.prodid.entity') problems.push(...entityProblems(record))
	return problems
}

function entityProblems(record: unknown): Problem[] {
	const entity = record as {
		opid?: unknown
		parents?: Record<string, unknown>
		children?: unknown[]
		merged_from?: unknown[]
		claims?: unknown[]
	}
	const problems: Problem[] = []
	const { opid } = entity
	for (const [key, value] of Object.entries(entity.parents ?? {})) {
		if (value === opid) problems.push(problem(`/parents/${key}`, 'self-reference', `/parents/${key} is the entity itself`))
	}
	for (const list of ['children', 'merged_from'] as const) {
		const values = entity[list]
		if (!Array.isArray(values)) continue
		values.forEach((value, index) => {
			if (value === opid) problems.push(problem(`/${list}/${index}`, 'self-reference', `/${list}/${index} is the entity itself`))
		})
	}
	if (!Array.isArray(entity.claims)) return problems
	entity.claims.forEach((claim, index) => {
		if (typeof claim !== 'object' || claim === null) return
		const { property, value, seen_at: seenAt, withdrawn_at: withdrawnAt } = claim as Record<string, unknown>
		if (typeof seenAt === 'string' && typeof withdrawnAt === 'string' && withdrawnAt < seenAt) {
			const at = `/claims/${index}/withdrawn_at`
			problems.push(problem(at, 'order', `${at} is before seen_at`))
		}
		if (property !== 'media' || typeof value !== 'object' || value === null) return
		const { sha256, media_url: mediaUrl } = value as Record<string, unknown>
		if (typeof sha256 !== 'string' || typeof mediaUrl !== 'string') return
		if (!mediaUrl.endsWith(`/${sha256}`)) {
			const at = `/claims/${index}/value/media_url`
			problems.push(problem(at, 'digest', `${at} does not address sha256`))
		}
	})
	return problems
}

function storabilityProblems(value: unknown, at: string): Problem[] {
	if (typeof value === 'string') {
		const defect = unstorable(value)
		return defect === null ? [] : [problem(at, 'storable', `${at || '/'} ${defect}`)]
	}
	if (Array.isArray(value)) return value.flatMap((item, index) => storabilityProblems(item, `${at}/${index}`))
	if (typeof value === 'object' && value !== null) {
		return Object.entries(value).flatMap(([key, item]) => {
			const path = `${at}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`
			const defect = unstorable(key)
			const here = defect === null ? [] : [problem(at, 'storable', `${at || '/'} key ${defect}`)]
			return [...here, ...storabilityProblems(item, path)]
		})
	}
	return []
}

function unstorable(value: string): string | null {
	if (value.includes('\u0000')) return 'contains U+0000'
	if (!value.isWellFormed()) return 'is not well-formed Unicode'
	return null
}

function gtinProblems(record: unknown): Problem[] {
	const identifiers = (record as { identifiers?: unknown }).identifiers
	if (!Array.isArray(identifiers)) return []
	return identifiers.flatMap((identifier, index) => {
		if (typeof identifier !== 'object' || identifier === null) return []
		const { scheme, value } = identifier as { scheme?: unknown; value?: unknown }
		if (scheme !== 'gtin' || typeof value !== 'string') return []
		if (classifyGtin(value) !== 'invalid') return []
		const at = `/identifiers/${index}/value`
		return [problem(at, 'gtin', `${at} is not a GTIN`)]
	})
}

function identifiableProblems(record: unknown): Problem[] {
	const { identifiers, brand } = record as { identifiers?: unknown; brand?: unknown }
	if (!Array.isArray(identifiers) || identifiers.length === 0) return []
	const usable = identifiers.some((identifier) => {
		if (typeof identifier !== 'object' || identifier === null) return false
		const { scheme, value } = identifier as { scheme?: unknown; value?: unknown }
		if (typeof value !== 'string' || value.trim() === '') return false
		if (scheme === 'mpn') return typeof brand === 'string' && normalizeBrand(brand) !== ''
		return true
	})
	if (usable) return []
	return [problem('/identifiers', 'identifiable', '/identifiers has nothing the index can store')]
}

function problem(instancePath: string, keyword: string, message: string): Problem {
	return { instancePath, keyword, params: {}, message }
}

function problemText(problems: readonly Problem[]): string {
	return problems.map((one) => one.message).join('; ')
}

function checkNdjson(path: string): string[] {
	return skippedLines(path).problems
}

function skippedLines(path: string): { problems: string[]; skipped: number[] } {
	const lines = readFileSync(path, 'utf8').split('\n')
	const problems: string[] = []
	const skipped: number[] = []
	lines.forEach((line, index) => {
		const at = `line ${index + 1}`
		if (line.trim() === '') {
			if (index !== lines.length - 1) problems.push(`${at}: empty`)
			return
		}
		const parsed = parse(line)
		if ('problem' in parsed) {
			problems.push(`${at}: ${parsed.problem}`)
			skipped.push(index + 1)
			return
		}
		const found = checkRecord(parsed.value, true)
		if (found.length > 0) skipped.push(index + 1)
		for (const found_ of found) problems.push(`${at}: ${found_}`)
	})
	return { problems, skipped }
}

function checkNdjsonFixture(path: string, name: string): string[] {
	const want = ndjsonExpected[name]
	if (!want) return ['no expected skipped lines in fixtures/ndjson/expected.json']
	ndjsonAsserted.add(name)
	const { skipped } = skippedLines(path)
	if (skipped.join(',') === want.join(',')) return []
	return [`skips lines ${skipped.join(', ') || 'none'}, expected ${want.join(', ') || 'none'}`]
}

function checkInvalidFixture(path: string, name: string): string[] {
	asserted.add(name)
	const defect = expected[name]
	if (!defect) return ['no expected defect in fixtures/expected.json']
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	const problems = recordProblems(parsed.value)
	if (typeof problems === 'string') return [problems]
	if (problems.length === 0) return ['accepted, but must be rejected']
	const wanted = problems.some(
		(one) =>
			one.instancePath === defect.instancePath &&
			one.keyword === defect.keyword &&
			Object.entries(defect.params ?? {}).every(([key, value]) => one.params[key] === value),
	)
	if (wanted) return []
	const want = `${defect.keyword} at ${defect.instancePath || '/'}${defect.params ? ` ${JSON.stringify(defect.params)}` : ''}`
	return [`rejected by ${problemText(problems)}, expected ${want}`]
}

function checkBrandVector(path: string): string[] {
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	const vector = parsed.value as Record<string, unknown>
	const problems = unknownFields(vector, ['input', 'normalized'])
	if (typeof vector.input !== 'string' || typeof vector.normalized !== 'string') {
		return [...problems, 'input and normalized must be strings']
	}
	const normalized = normalizeBrand(vector.input)
	if (normalized !== vector.normalized) problems.push(`normalizes to ${JSON.stringify(normalized)}`)
	if (normalizeBrand(vector.normalized) !== vector.normalized) problems.push('normalized form is not stable')
	return problems
}

function normalizeBrand(brand: string): string {
	return brand.normalize('NFKC').toLowerCase().replaceAll('ı', 'i').replaceAll(/i̇+/gu, 'i').replaceAll(/\s+/gu, ' ').trim()
}

function checkGtinVector(path: string): string[] {
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	const vector = parsed.value as Record<string, unknown>
	const problems = unknownFields(vector, ['value', 'verdict'])
	const { value, verdict } = vector
	if (typeof value !== 'string' || (verdict !== 'gtin' && verdict !== 'rcn' && verdict !== 'invalid')) {
		return [...problems, 'value must be a string and verdict gtin, rcn or invalid']
	}
	const read = classifyGtin(value)
	if (read !== verdict) problems.push(`reads as ${read}`)
	return problems
}

function classifyGtin(value: string): 'gtin' | 'rcn' | 'invalid' {
	if (!/^[0-9]+$/.test(value)) return 'invalid'
	if (![8, 12, 13, 14].includes(value.length)) return 'invalid'
	if (!hasGtinCheckDigit(value)) return 'invalid'
	if (/^0+$/.test(value)) return 'invalid'
	const fourteen = value.padStart(14, '0')
	if (fourteen.startsWith('000000')) return /^[02]/.test(fourteen.slice(6)) ? 'rcn' : 'gtin'
	return /^(02|04|2[0-9])/.test(fourteen.slice(1)) ? 'rcn' : 'gtin'
}

function hasGtinCheckDigit(value: string): boolean {
	let sum = 0
	for (let at = value.length - 2, weight = 3; at >= 0; at -= 1, weight = weight === 3 ? 1 : 3) {
		sum += Number(value[at]) * weight
	}
	return String((10 - (sum % 10)) % 10) === value.at(-1)
}

function unknownFields(vector: Record<string, unknown>, allowed: readonly string[]): string[] {
	if (typeof vector !== 'object' || vector === null || Array.isArray(vector)) return ['not an object']
	return Object.keys(vector)
		.filter((key) => !allowed.includes(key))
		.map((key) => `unknown field ${key}`)
}

function checkTxtVector(path: string): string[] {
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	if (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) return ['not an object']
	const vector = parsed.value as Record<string, unknown>
	const problems: string[] = []
	for (const key of Object.keys(vector)) {
		if (key !== 'value' && key !== 'outcome' && key !== 'host') problems.push(`unknown field ${key}`)
	}
	const value = vector.value
	if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== 'string')) {
		return [...problems, 'value must be a non-empty array of strings']
	}
	const parts = value as string[]
	if (parts.some((part) => bytes(part) > MAX_CHARACTER_STRING_BYTES)) {
		problems.push(`a character-string is over ${MAX_CHARACTER_STRING_BYTES} bytes`)
	}
	const outcome = vector.outcome
	if (outcome !== 'delegation' && outcome !== 'ignored' && outcome !== 'malformed') {
		return [...problems, 'outcome must be delegation, ignored or malformed']
	}
	if (outcome === 'delegation' && typeof vector.host !== 'string') problems.push('a delegation must state its host')
	if (outcome !== 'delegation' && 'host' in vector) problems.push('only a delegation states a host')
	if (typeof vector.host === 'string' && !isHost(vector.host)) problems.push(`host is not a hostname: ${vector.host}`)

	const read = parseTxtRecord(parts)
	if (read.outcome !== outcome) problems.push(`the grammar reads it as ${read.outcome}`)
	else if (read.host !== undefined && read.host !== vector.host) problems.push(`the grammar reads host ${read.host}`)
	return problems
}

function parseTxtRecord(parts: readonly string[]): TxtResult {
	const value = parts.join('')
	if (!startsWithVersion(value)) return { outcome: 'ignored' }
	if (bytes(value) > MAX_TXT_BYTES) return { outcome: 'malformed' }

	const fields = value.trim().split(';')
	if (fields.at(-1)?.trim() === '') fields.pop()
	const tags = new Map<string, string>()
	for (const field of fields) {
		const at = field.indexOf('=')
		if (at === -1) return { outcome: 'malformed' }
		const name = field.slice(0, at).trim()
		const tagValue = field.slice(at + 1).trim()
		if (!TAG_NAME.test(name) || !TAG_VALUE.test(tagValue) || tags.has(name)) return { outcome: 'malformed' }
		tags.set(name, tagValue)
	}

	if (tags.get('v') !== TXT_VERSION) return { outcome: 'malformed' }
	const host = tags.get('host')
	if (host === undefined) return { outcome: 'malformed' }
	const normalized = normalizeTxtHost(host)
	if (!isHost(normalized)) return { outcome: 'malformed' }
	return { outcome: 'delegation', host: normalized }
}

function startsWithVersion(value: string): boolean {
	let at = skipSpace(value, 0)
	if (value[at] !== 'v') return false
	at = skipSpace(value, at + 1)
	if (value[at] !== '=') return false
	at = skipSpace(value, at + 1)
	if (!value.startsWith(TXT_VERSION, at)) return false
	const next = value[at + TXT_VERSION.length]
	return next === undefined || next === ';' || next === ' ' || next === '\t'
}

function skipSpace(value: string, from: number): number {
	let at = from
	while (value[at] === ' ' || value[at] === '\t') at += 1
	return at
}

function normalizeTxtHost(host: string): string {
	return host.toLowerCase().replace(/\.$/, '')
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

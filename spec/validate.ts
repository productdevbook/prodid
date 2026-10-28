import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import addFormats from 'ajv-formats'
import Ajv2020, { type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020'

type Defect = { instancePath: string; keyword: string; params?: Record<string, unknown> }
type Problem = { instancePath: string; keyword: string; params: Record<string, unknown>; message: string }
type TxtOutcome = 'delegation' | 'ignored' | 'malformed'
type TxtResult = { outcome: TxtOutcome; host?: string }
type MerchantImport = { ndjson: string; declared: { lang: string; markets: string[]; license: string }; skipped_rows: number[] }
type Version = 0 | 1

const INGESTIBLE_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-ND-4.0', 'CC-BY-3.0', 'CC-BY-SA-3.0', 'CC-BY-ND-3.0']

const MAX_TXT_BYTES = 512
const MAX_CHARACTER_STRING_BYTES = 255
const TXT_VERSION = 'prodid0'
const TAG_NAME = /^[a-z][a-z0-9-]*$/
const TAG_VALUE = /^[!-:<-~]*$/

const root = import.meta.dir
const ajv = new Ajv2020({ strict: true, allErrors: true })
addFormats(ajv)

const VERSIONS: readonly Version[] = [0, 1]
const SCHEMA_DIRS: Record<Version, string> = { 0: 'schemas', 1: join('schemas', 'v1') }
const schemas = new Map<string, AnySchemaObject>()
const validators = new Map<Version, Map<string, ValidateFunction>>()
for (const version of VERSIONS) {
	const compiled = new Map<string, ValidateFunction>()
	for (const name of jsonFiles(join(root, SCHEMA_DIRS[version]))) {
		const schema = JSON.parse(readFileSync(join(root, SCHEMA_DIRS[version], name), 'utf8')) as AnySchemaObject
		const type: unknown = schema.properties?.$type?.const
		if (typeof type !== 'string') throw new Error(`${name}: no $type const`)
		if (schema.$id !== `https://prodid.org/schemas/v${version}/${name}`) {
			throw new Error(`${SCHEMA_DIRS[version]}/${name}: $id is not https://prodid.org/schemas/v${version}/${name}`)
		}
		if (version === 0) schemas.set(type, schema)
		compiled.set(type, ajv.compile(schema))
	}
	validators.set(version, compiled)
}

const V1 = join('fixtures', 'v1')
const expected = JSON.parse(readFileSync(join(root, 'fixtures', 'expected.json'), 'utf8')) as Record<string, Defect>
const v1Expected = JSON.parse(readFileSync(join(root, V1, 'expected.json'), 'utf8')) as Record<string, Defect>
const merchantExpected = JSON.parse(readFileSync(join(root, 'fixtures', 'merchant', 'expected.json'), 'utf8')) as Record<
	string,
	MerchantImport
>
const ndjsonExpected = JSON.parse(readFileSync(join(root, 'fixtures', 'ndjson', 'expected.json'), 'utf8')) as Record<string, number[]>
const dumpExpected = JSON.parse(readFileSync(join(root, 'fixtures', 'dump', 'expected.json'), 'utf8')) as Record<string, Defect>
const v1DumpExpected = JSON.parse(readFileSync(join(root, V1, 'dump', 'expected.json'), 'utf8')) as Record<string, Defect>
const domainRule = schemas.get('org.prodid.feed')?.properties.domain as { pattern: string; maxLength: number }
const isHost = (value: string): boolean => new RegExp(domainRule.pattern).test(value) && bytes(value) <= domainRule.maxLength

if (process.argv[2] === '--emit-merchant') {
	for (const [name, want] of Object.entries(merchantExpected)) {
		const csv = readFileSync(join(root, 'fixtures', 'merchant', name), 'utf8')
		const { records } = importMerchant(csv, want.declared, 1)
		writeFileSync(join(root, 'fixtures', 'merchant', want.ndjson), `${records.join('\n')}\n`)
		console.log(`wrote fixtures/merchant/${want.ndjson}: ${records.length} records`)
	}
	process.exit(0)
}

let failures = 0
const asserted = new Set<string>()
const ndjsonAsserted = new Set<string>()
const dumpAsserted = new Set<string>()
const v1Asserted = new Set<string>()
const v1DumpAsserted = new Set<string>()

checkDocuments(0, { examples: 'examples', fixtures: 'fixtures' }, [expected, asserted], [dumpExpected, dumpAsserted])
checkDocuments(1, { examples: join(V1, 'examples'), fixtures: V1 }, [v1Expected, v1Asserted], [v1DumpExpected, v1DumpAsserted])
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
for (const name of readdirSync(join(root, 'fixtures', 'merchant')).sort()) {
	if (!name.endsWith('.csv')) continue
	report(join(root, 'fixtures', 'merchant', name), checkMerchantFixture(name))
}
for (const [path, defects, seen] of [
	[join('fixtures', 'expected.json'), expected, asserted],
	[join('fixtures', 'dump', 'expected.json'), dumpExpected, dumpAsserted],
	[join(V1, 'expected.json'), v1Expected, v1Asserted],
	[join(V1, 'dump', 'expected.json'), v1DumpExpected, v1DumpAsserted],
] as const) {
	report(
		join(root, path),
		Object.keys(defects)
			.filter((name) => !seen.has(name))
			.map((name) => `no fixture named ${name}`),
	)
}
report(
	join(root, 'fixtures', 'ndjson', 'expected.json'),
	Object.keys(ndjsonExpected)
		.filter((name) => !ndjsonAsserted.has(name))
		.map((name) => `no fixture named ${name}`),
)

process.exit(failures === 0 ? 0 : 1)

function checkDocuments(
	version: Version,
	dirs: { examples: string; fixtures: string },
	[defects, seen]: readonly [Record<string, Defect>, Set<string>],
	[dumpDefects, dumpSeen]: readonly [Record<string, Defect>, Set<string>],
): void {
	for (const name of readdirSync(join(root, dirs.examples)).sort()) {
		const path = join(root, dirs.examples, name)
		if (name.endsWith('.ndjson')) report(path, checkNdjson(path, version))
		else if (name.endsWith('.json')) report(path, checkFile(path, version))
	}
	for (const name of jsonFiles(join(root, dirs.fixtures, 'valid'))) {
		report(join(root, dirs.fixtures, 'valid', name), checkFile(join(root, dirs.fixtures, 'valid', name), version))
	}
	for (const name of jsonFiles(join(root, dirs.fixtures, 'invalid'))) {
		const path = join(root, dirs.fixtures, 'invalid', name)
		report(path, checkInvalidFixture(path, name, version, defects, seen))
	}
	for (const name of jsonFiles(join(root, dirs.fixtures, 'dump', 'valid'))) {
		const path = join(root, dirs.fixtures, 'dump', 'valid', name)
		report(path, checkFile(path, version))
	}
	for (const name of jsonFiles(join(root, dirs.fixtures, 'dump', 'invalid'))) {
		const path = join(root, dirs.fixtures, 'dump', 'invalid', name)
		report(path, checkInvalidFixture(path, name, version, dumpDefects, dumpSeen))
	}
}

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

function checkFile(path: string, version: Version): string[] {
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	return checkRecord(parsed.value, version)
}

function checkRecord(record: unknown, version: Version): string[] {
	const problems = recordProblems(record, version)
	if (typeof problems === 'string') return [problems]
	return problems.length === 0 ? [] : [problemText(problems)]
}

function recordProblems(record: unknown, version: Version): Problem[] | string {
	const type = (record as { $type?: unknown } | null)?.$type
	if (typeof type !== 'string') return 'no $type'
	const validate = validators.get(version)?.get(type)
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
	if (type === 'org.prodid.dump') problems.push(...dumpProblems(record))
	return problems
}

function dumpProblems(record: unknown): Problem[] {
	const { created_at: createdAt, snapshot_at: snapshotAt } = record as Record<string, unknown>
	if (typeof createdAt !== 'string' || typeof snapshotAt !== 'string') return []
	if (Date.parse(snapshotAt) <= Date.parse(createdAt)) return []
	return [problem('/snapshot_at', 'order', '/snapshot_at is after created_at')]
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

function checkNdjson(path: string, version: Version): string[] {
	return skippedLines(path, version).problems
}

function skippedLines(path: string, version: Version): { problems: string[]; skipped: number[] } {
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
		const found = checkRecord(parsed.value, version)
		if (found.length > 0) skipped.push(index + 1)
		for (const found_ of found) problems.push(`${at}: ${found_}`)
	})
	return { problems, skipped }
}

function checkNdjsonFixture(path: string, name: string): string[] {
	const want = ndjsonExpected[name]
	if (!want) return ['no expected skipped lines in fixtures/ndjson/expected.json']
	ndjsonAsserted.add(name)
	return VERSIONS.flatMap((version) => {
		const { skipped } = skippedLines(path, version)
		if (skipped.join(',') === want.join(',')) return []
		return [`v${version} skips lines ${skipped.join(', ') || 'none'}, expected ${want.join(', ') || 'none'}`]
	})
}

function checkMerchantFixture(name: string): string[] {
	const dir = join(root, 'fixtures', 'merchant')
	const want = merchantExpected[name]
	if (!want) return ['no entry in fixtures/merchant/expected.json']
	const problems: string[] = []
	if (!isIngestibleLicence(want.declared.license)) problems.push(`declared licence ${want.declared.license} is not ingestible`)

	const lines = readFileSync(join(dir, want.ndjson), 'utf8').trim().split('\n')
	for (const version of VERSIONS) {
		const imported = importMerchant(readFileSync(join(dir, name), 'utf8'), want.declared, version)
		if (imported.skipped.join(',') !== want.skipped_rows.join(',')) {
			problems.push(`v${version} skips rows ${imported.skipped.join(', ') || 'none'}, expected ${want.skipped_rows.join(', ') || 'none'}`)
		}
		problems.push(...skippedLines(join(dir, want.ndjson), version).problems.map((one) => `v${version} ${want.ndjson}: ${one}`))
		if (lines.length !== imported.records.length) {
			problems.push(`${want.ndjson} has ${lines.length} records, the v${version} mapping produces ${imported.records.length}`)
			continue
		}
		lines.forEach((line, index) => {
			if (line !== imported.records[index]) problems.push(`${want.ndjson} line ${index + 1} is not what the v${version} mapping produces`)
		})
	}
	return problems
}

function isIngestibleLicence(licence: string): boolean {
	return INGESTIBLE_LICENCES.includes(licence)
}

function importMerchant(csv: string, declared: MerchantImport['declared'], version: Version): { records: string[]; skipped: number[] } {
	const rows = parseCsv(csv)
	const header = rows[0] ?? []
	const records: string[] = []
	const skipped: number[] = []
	rows.slice(1).forEach((cells, index) => {
		const record = merchantRecord(header, cells, declared)
		const found = recordProblems(record, version)
		if (typeof found === 'string' || found.length > 0) skipped.push(index + 2)
		else records.push(JSON.stringify(record))
	})
	return { records, skipped }
}

function parseCsv(text: string): string[][] {
	return text
		.trim()
		.split('\n')
		.map((line) => {
			const cells: string[] = []
			let cell = ''
			let quoted = false
			for (let at = 0; at < line.length; at += 1) {
				const character = line[at]
				if (quoted && character === '"' && line[at + 1] === '"') {
					cell += '"'
					at += 1
				} else if (character === '"') quoted = !quoted
				else if (character === ',' && !quoted) {
					cells.push(cell)
					cell = ''
				} else cell += character
			}
			cells.push(cell)
			return cells
		})
}

function merchantRecord(header: readonly string[], cells: readonly string[], declared: MerchantImport['declared']): unknown {
	const whole = (attribute: string): string => {
		const at = header.indexOf(attribute)
		return at === -1 ? '' : (cells[at] ?? '').trim()
	}
	const repeated = (attribute: string): string[] => {
		const columns = header.filter((name) => name === attribute).length
		return header.flatMap((name, at) => {
			if (name !== attribute) return []
			const cell = (cells[at] ?? '').trim()
			const values = columns > 1 ? [cell] : cell.split(',')
			return values.map((value) => value.trim()).filter((value) => value !== '')
		})
	}

	const record: Record<string, unknown> = { $type: 'org.prodid.item', key: whole('id'), brand: whole('brand'), name: whole('title') }
	record.lang = declared.lang
	if (whole('item_group_id') !== '') record.group = whole('item_group_id')

	const variant: Record<string, string> = {}
	for (const axis of ['color', 'size', 'material', 'pattern']) {
		if (whole(axis) !== '') variant[axis] = whole(axis)
	}
	if (Object.keys(variant).length > 0) record.variant = variant

	const identifiers: { scheme: string; value: string }[] = []
	if (whole('gtin') !== '') identifiers.push({ scheme: 'gtin', value: whole('gtin') })
	if (whole('mpn') !== '') identifiers.push({ scheme: 'mpn', value: whole('mpn') })
	if (whole('id') !== '') identifiers.push({ scheme: 'sku', value: whole('id') })
	record.identifiers = identifiers
	record.markets = declared.markets

	const properties: Record<string, unknown> = {}
	const text = (attribute: string, key: string): void => {
		if (whole(attribute) !== '') properties[key] = whole(attribute)
	}
	text('description', 'description')
	text('gender', 'gender')
	text('age_group', 'ageGroup')
	text('size_type', 'sizeType')
	text('size_system', 'sizeSystem')
	text('energy_efficiency_class', 'energyEfficiencyClass')
	text('google_product_category', 'googleProductCategory')
	const list = (attribute: string, key: string): void => {
		const values = repeated(attribute)
		if (values.length > 0) properties[key] = values
	}
	list('product_type', 'productType')
	list('product_highlight', 'highlights')
	list('certification', 'certification')
	if (whole('multipack') !== '' && Number.isFinite(Number(whole('multipack')))) properties.multipack = Number(whole('multipack'))
	if (whole('is_bundle') !== '') properties.isBundle = whole('is_bundle') === 'yes'
	for (const [attribute, key] of [
		['product_weight', 'weight'],
		['product_length', 'length'],
		['product_width', 'width'],
		['product_height', 'height'],
	] as const) {
		const measure = parseMeasure(whole(attribute))
		if (measure !== null) properties[key] = measure
	}
	for (const detail of repeated('product_detail')) {
		const parts = detail.split(':')
		const key = parts.length === 3 ? camelCase(parts[1] ?? '') : null
		if (key === null || parts[2] === undefined || parts[2] === '' || key in properties) continue
		properties[key] = parts[2]
	}
	if (Object.keys(properties).length > 0) record.properties = properties

	const media = [...repeated('image_link'), ...repeated('additional_image_link')].map((url) => ({
		url,
		license: declared.license,
		kind: 'image',
	}))
	const documents = repeated('document_link').map((url) => ({ url, license: declared.license, kind: 'document' }))
	if (media.length + documents.length > 0) record.media = [...media, ...documents]
	return record
}

function parseMeasure(value: string): { value: number; unit: string } | null {
	const [amount, unit] = value.split(' ')
	if (amount === undefined || unit === undefined || !Number.isFinite(Number(amount))) return null
	return { value: Number(amount), unit }
}

function camelCase(name: string): string | null {
	const words = name
		.trim()
		.toLowerCase()
		.split(/[\s_-]+/u)
	const key = words.map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join('')
	return /^[a-z][A-Za-z0-9]*$/.test(key) ? key : null
}

function checkInvalidFixture(path: string, name: string, version: Version, defects: Record<string, Defect>, seen: Set<string>): string[] {
	seen.add(name)
	const defect = defects[name]
	if (!defect) return [`no expected defect in ${relative(root, join(path, '..', '..', 'expected.json'))}`]
	const parsed = parse(readFileSync(path, 'utf8'))
	if ('problem' in parsed) return [parsed.problem]
	const problems = recordProblems(parsed.value, version)
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

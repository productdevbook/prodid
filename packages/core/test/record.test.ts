import { describe, expect, test } from 'bun:test'

import { canonicalHash } from '../src/canonical'
import {
	type CrawlStatus,
	type SpecVersion,
	validateDump,
	validateEntity,
	validateFeed,
	validateItem,
	validateSource,
	type ValidationResult,
} from '../src/record/index'

const SPEC = new URL('../../../spec/', import.meta.url)
const GENERATED = new URL('../src/record/validators.generated.js', import.meta.url)

async function fixtures(folder: string): Promise<string[]> {
	const names: string[] = []
	for await (const name of new Bun.Glob('*.json').scan({ cwd: new URL(folder, SPEC).pathname })) names.push(name)
	return names.sort()
}

function validateByName(name: string, value: unknown, version: SpecVersion): ValidationResult<unknown> {
	if (name.startsWith('item.')) return validateItem(value)
	if (name.startsWith('entity.')) return validateEntity(value, { version })
	if (name.startsWith('source.')) return validateSource(value, { version })
	return validateFeed(value, { version })
}

const valid = await fixtures('fixtures/valid/')
const invalid = await fixtures('fixtures/invalid/')
const expected = (await Bun.file(new URL('fixtures/expected.json', SPEC)).json()) as Record<
	string,
	{ instancePath: string; keyword: string }
>

describe('the record validators', () => {
	test('the spec ships fixtures on both sides', () => {
		expect(valid.length).toBeGreaterThan(0)
		expect(invalid.length).toBeGreaterThan(0)
	})

	test.each(valid)('accepts fixtures/valid/%s', async (name) => {
		const result = validateByName(name, await Bun.file(new URL(`fixtures/valid/${name}`, SPEC)).json(), 0)
		expect(result.ok ? [] : result.errors).toEqual([])
	})

	test.each(invalid)('refuses fixtures/invalid/%s for the reason the spec expects', async (name) => {
		const result = validateByName(name, await Bun.file(new URL(`fixtures/invalid/${name}`, SPEC)).json(), 0)
		expect(result.ok).toBe(false)
		if (result.ok) return
		const want = expected[name]
		if (want === undefined) return
		expect(result.errors).toContainEqual(
			expect.objectContaining({ path: want.instancePath === '' ? '/' : want.instancePath, keyword: want.keyword }),
		)
	})

	test('accepts the published examples', async () => {
		expect(validateItem(await Bun.file(new URL('examples/item.jacket.json', SPEC)).json()).ok).toBe(true)
		expect(validateFeed(await Bun.file(new URL('examples/prodid.json', SPEC)).json()).ok).toBe(true)
		expect(validateFeed(await Bun.file(new URL('examples/prodid.delegated.json', SPEC)).json()).ok).toBe(true)
	})

	test('reports the path of every problem', () => {
		const result = validateItem({
			$type: 'org.prodid.item',
			key: 'TB-100',
			brand: '',
			name: 'Trail Bottle 1L',
			identifiers: [{ scheme: 'gtin', value: 'nope' }],
		})
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors.map((error) => error.path)).toContain('/brand')
		expect(result.errors.map((error) => error.path)).toContain('/identifiers/0/value')
		for (const error of result.errors) expect(error.message.length).toBeGreaterThan(0)
	})

	test('reports the root as a path', () => {
		const result = validateItem(42)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors[0]?.path).toBe('/')
	})

	test('applies draft 2020-12 if/then, propertyNames and uniqueItems', () => {
		const base = { $type: 'org.prodid.item', key: 'TB-100', brand: 'Acme', name: 'Trail Bottle 1L' }
		const gtin = { scheme: 'gtin', value: '9506000134420' }
		// if/then: the digits-only rule applies to gtin and to nothing else.
		expect(validateItem({ ...base, identifiers: [{ scheme: 'gtin', value: 'TJ-2041' }] }).ok).toBe(false)
		expect(validateItem({ ...base, identifiers: [{ scheme: 'mpn', value: 'TJ-2041' }] }).ok).toBe(true)
		// propertyNames
		expect(validateItem({ ...base, identifiers: [gtin], variant: { Color: 'navy' } }).ok).toBe(false)
		expect(validateItem({ ...base, identifiers: [gtin], variant: { color: 'navy' } }).ok).toBe(true)
		// uniqueItems
		expect(validateItem({ ...base, identifiers: [gtin, { ...gtin }] }).ok).toBe(false)
		expect(validateItem({ ...base, identifiers: [gtin], markets: ['TR', 'TR'] }).ok).toBe(false)
	})

	test('applies format uri and format email', () => {
		const feed = { $type: 'org.prodid.feed', version: 0, license: 'CC0-1.0', feeds: ['https://acme.example/items.ndjson'] }
		expect(validateFeed({ ...feed, publisher: { name: 'Acme', contact: 'data@acme.example' } }).ok).toBe(true)
		expect(validateFeed({ ...feed, publisher: { name: 'Acme', contact: 'data at acme dot example' } }).ok).toBe(false)
		expect(validateFeed({ ...feed, publisher: { name: 'Acme' }, feeds: ['https://acme example/items.ndjson'] }).ok).toBe(false)
	})
})

const dumpValid = await fixtures('fixtures/dump/valid/')
const dumpInvalid = await fixtures('fixtures/dump/invalid/')
const dumpExpected = (await Bun.file(new URL('fixtures/dump/expected.json', SPEC)).json()) as Record<
	string,
	{ instancePath: string; keyword: string }
>

describe('validateDump', () => {
	test('the spec ships dump fixtures on both sides, each refusal with its reason', () => {
		expect(dumpValid.length).toBeGreaterThan(0)
		expect(dumpInvalid.length).toBeGreaterThan(0)
		expect(Object.keys(dumpExpected).sort()).toEqual(dumpInvalid)
	})

	test.each(dumpValid)('accepts fixtures/dump/valid/%s', async (name) => {
		const result = validateDump(await Bun.file(new URL(`fixtures/dump/valid/${name}`, SPEC)).json(), { version: 0 })
		expect(result.ok ? [] : result.errors).toEqual([])
	})

	test.each(dumpInvalid)('refuses fixtures/dump/invalid/%s for the reason the spec expects', async (name) => {
		const result = validateDump(await Bun.file(new URL(`fixtures/dump/invalid/${name}`, SPEC)).json(), { version: 0 })
		expect(result.ok).toBe(false)
		if (result.ok) return
		const want = dumpExpected[name]
		if (want === undefined) return
		expect(result.errors).toContainEqual(
			expect.objectContaining({ path: want.instancePath === '' ? '/' : want.instancePath, keyword: want.keyword }),
		)
	})

	test('takes a manifest written the moment its snapshot was taken', async () => {
		const manifest = await Bun.file(new URL('fixtures/dump/valid/manifest.json', SPEC)).json()
		expect(validateDump({ ...manifest, created_at: manifest.snapshot_at }).ok).toBe(true)
	})

	test('compares the two times as instants, not as text', async () => {
		const manifest = await Bun.file(new URL('fixtures/dump/valid/manifest.json', SPEC)).json()
		expect(validateDump({ ...manifest, snapshot_at: '2026-11-02T06:30:02+02:00' }).ok).toBe(true)
		expect(validateDump({ ...manifest, snapshot_at: '2026-11-02T04:30:02-02:00' }).ok).toBe(false)
	})
})

const V1 = 'fixtures/v1/'
const v1Valid = await fixtures(`${V1}valid/`)
const v1Invalid = await fixtures(`${V1}invalid/`)
const v1Expected = (await Bun.file(new URL(`${V1}expected.json`, SPEC)).json()) as Record<string, { instancePath: string; keyword: string }>
const v1DumpValid = await fixtures(`${V1}dump/valid/`)
const v1DumpInvalid = await fixtures(`${V1}dump/invalid/`)
const v1DumpExpected = (await Bun.file(new URL(`${V1}dump/expected.json`, SPEC)).json()) as Record<
	string,
	{ instancePath: string; keyword: string }
>

function refusedFor(result: ValidationResult<unknown>, want: { instancePath: string; keyword: string } | undefined): void {
	expect(result.ok).toBe(false)
	if (result.ok || want === undefined) return
	expect(result.errors).toContainEqual(
		expect.objectContaining({ path: want.instancePath === '' ? '/' : want.instancePath, keyword: want.keyword }),
	)
}

describe('the v1 validators', () => {
	test('the spec ships v1 fixtures on both sides', () => {
		expect(v1Valid.length).toBeGreaterThan(0)
		expect(v1Invalid.length).toBeGreaterThan(0)
		expect(Object.keys(v1DumpExpected).sort()).toEqual(v1DumpInvalid)
	})

	test.each(v1Valid)('accepts fixtures/v1/valid/%s', async (name) => {
		const result = validateByName(name, await Bun.file(new URL(`${V1}valid/${name}`, SPEC)).json(), 1)
		expect(result.ok ? [] : result.errors).toEqual([])
	})

	test.each(v1Invalid)('refuses fixtures/v1/invalid/%s for the reason the spec expects', async (name) => {
		refusedFor(validateByName(name, await Bun.file(new URL(`${V1}invalid/${name}`, SPEC)).json(), 1), v1Expected[name])
	})

	test.each(v1DumpValid)('accepts fixtures/v1/dump/valid/%s', async (name) => {
		const result = validateDump(await Bun.file(new URL(`${V1}dump/valid/${name}`, SPEC)).json(), { version: 1 })
		expect(result.ok ? [] : result.errors).toEqual([])
	})

	test.each(v1DumpInvalid)('refuses fixtures/v1/dump/invalid/%s for the reason the spec expects', async (name) => {
		refusedFor(validateDump(await Bun.file(new URL(`${V1}dump/invalid/${name}`, SPEC)).json(), { version: 1 }), v1DumpExpected[name])
	})

	test('accepts the published v1 examples', async () => {
		const example = async (name: string): Promise<unknown> => await Bun.file(new URL(`${V1}examples/${name}`, SPEC)).json()
		expect(validateItem(await example('item.jacket.json')).ok).toBe(true)
		expect(validateFeed(await example('prodid.json'), { version: 1 }).ok).toBe(true)
		expect(validateFeed(await example('prodid.delegated.json'), { version: 1 }).ok).toBe(true)
		expect(validateEntity(await example('entity.item.json'), { version: 1 }).ok).toBe(true)
		expect(validateEntity(await example('entity.family.json'), { version: 1 }).ok).toBe(true)
		expect(validateSource(await example('source.json'), { version: 1 }).ok).toBe(true)
	})
})

describe('a document is read by the version it declares', () => {
	const feed = { $type: 'org.prodid.feed', publisher: { name: 'Acme' }, license: 'CC0-1.0', feeds: ['https://acme.example/items.ndjson'] }
	const entity = { $type: 'org.prodid.entity', opid: 'h027qsrdrp9c06x1', kind: 'family', identifiers: [], claims: [] }
	const source = { $type: 'org.prodid.source', name: 'acme.example', kind: 'domain', trust: 'unverified', lapsed: false }

	test('a discovery document is v0 or v1, and nothing else', () => {
		expect(validateFeed({ ...feed, version: 0 }).ok).toBe(true)
		expect(validateFeed({ ...feed, version: 1 }).ok).toBe(true)
		refusedFor(validateFeed({ ...feed, version: 2 }), { instancePath: '/version', keyword: 'const' })
		refusedFor(validateFeed(feed), { instancePath: '', keyword: 'required' })
	})

	test('an entity or a status is v0 without a version and v1 with version 1', () => {
		expect(validateEntity(entity).ok).toBe(true)
		expect(validateEntity({ ...entity, version: 1 }).ok).toBe(true)
		refusedFor(validateEntity({ ...entity, version: 0 }), { instancePath: '/version', keyword: 'const' })
		expect(validateSource(source).ok).toBe(true)
		expect(validateSource({ ...source, version: 1 }).ok).toBe(true)
		refusedFor(validateSource({ ...source, version: 2 }), { instancePath: '/version', keyword: 'const' })
	})

	test('a dump manifest of either version stays loadable', async () => {
		const v0 = await Bun.file(new URL('fixtures/dump/valid/manifest.json', SPEC)).json()
		const v1 = await Bun.file(new URL(`${V1}dump/valid/manifest.json`, SPEC)).json()
		expect(validateDump(v0).ok).toBe(true)
		expect(validateDump(v1).ok).toBe(true)
		refusedFor(validateDump({ ...v1, version: 2 }), { instancePath: '/version', keyword: 'const' })
	})

	test('a pinned version refuses the other one', () => {
		refusedFor(validateFeed({ ...feed, version: 0 }, { version: 1 }), { instancePath: '/version', keyword: 'const' })
		refusedFor(validateFeed({ ...feed, version: 1 }, { version: 0 }), { instancePath: '/version', keyword: 'const' })
		refusedFor(validateEntity(entity, { version: 1 }), { instancePath: '', keyword: 'required' })
		refusedFor(validateSource({ ...source, version: 1 }, { version: 0 }), { instancePath: '', keyword: 'additionalProperties' })
	})
})

describe('validateEntity and validateSource', () => {
	const claim = {
		property: 'brand',
		value: 'Acme',
		source: { name: 'acme.example', trust: 'verified', lapsed: false },
		seen_at: '2026-09-19T10:00:00Z',
	}
	const family = { $type: 'org.prodid.entity', opid: 'h027qsrdrp9c06x1', kind: 'family', identifiers: [], claims: [claim] }
	const source = { $type: 'org.prodid.source', name: 'acme.example', kind: 'domain', trust: 'unverified', lapsed: false }

	test('ties an entity kind to the ancestors it must carry', () => {
		expect(validateEntity(family).ok).toBe(true)
		expect(validateEntity({ ...family, parents: { family: 'h027qsrdrp9c06x2' } }).ok).toBe(false)
		expect(validateEntity({ ...family, kind: 'variant' }).ok).toBe(false)
		expect(validateEntity({ ...family, kind: 'variant', parents: { family: 'h027qsrdrp9c06x2' } }).ok).toBe(true)
		expect(validateEntity({ ...family, kind: 'item', parents: { family: 'h027qsrdrp9c06x2' } }).ok).toBe(false)
		expect(validateEntity({ ...family, kind: 'item', parents: { family: 'h027qsrdrp9c06x2', variant: 'h027qsrdrp9c06x3' } }).ok).toBe(true)
	})

	test('refuses an opid that is not an opid and a claim with no source', () => {
		expect(validateEntity({ ...family, opid: 'H027QSRDRP9C06X1' }).ok).toBe(false)
		expect(validateEntity({ ...family, opid: 'illouillouillou' }).ok).toBe(false)
		const { source: _removed, ...orphan } = claim
		expect(validateEntity({ ...family, claims: [orphan] }).ok).toBe(false)
		expect(validateEntity({ ...family, claims: [{ ...claim, seen_at: 'yesterday' }] }).ok).toBe(false)
	})

	test('ties a source status to the proof and the lapse it claims', () => {
		expect(validateSource(source).ok).toBe(true)
		expect(validateSource({ ...source, trust: 'verified' }).ok).toBe(false)
		expect(validateSource({ ...source, trust: 'verified', verified_by: 'dns-txt', verified_at: '2026-09-19T10:00:00Z' }).ok).toBe(true)
		expect(validateSource({ ...source, lapsed: true }).ok).toBe(false)
		expect(validateSource({ ...source, lapsed: true, lapsed_at: '2026-09-19T10:00:00Z' }).ok).toBe(true)
		expect(validateSource({ ...source, lapsed_at: '2026-09-19T10:00:00Z' }).ok).toBe(false)
	})

	test('bounds what a crawl may report', () => {
		const at = '2026-09-19T10:00:00Z'
		expect(validateSource({ ...source, last_crawl: { at, outcome: 'success' } }).ok).toBe(true)
		expect(validateSource({ ...source, last_crawl: { at, outcome: 'rate-limited' } }).ok).toBe(false)
		expect(validateSource({ ...source, last_crawl: { at, outcome: 'success', http_status: 99 } }).ok).toBe(false)
		expect(validateSource({ ...source, last_crawl: { at, outcome: 'success', document_url: 'http://acme.example/x' } }).ok).toBe(false)
	})

	test('types an import as a crawl a dataset reports, and only a dataset', () => {
		const imported: CrawlStatus = {
			at: '2026-11-03T02:14:55Z',
			via: 'import',
			document_url: 'https://exports.example/x.jsonl.gz',
			outcome: 'success',
		}
		const dataset = { ...source, name: 'dataset:wikidata', kind: 'dataset', license: 'CC0-1.0', last_crawl: imported }
		expect(validateSource(dataset).ok).toBe(true)
		expect(validateSource({ ...dataset, name: 'acme.example', kind: 'domain' }).ok).toBe(false)
	})
})

describe('the validators run where eval is forbidden', () => {
	test('the generated module holds no dynamic code and no require', async () => {
		const source = await Bun.file(GENERATED).text()
		expect(source).not.toMatch(/\beval\s*\(/)
		expect(source).not.toMatch(/\bFunction\s*\(/)
		expect(source).not.toMatch(/\brequire\s*\(/)
	})

	test('validation never reaches Function or eval', async () => {
		const host = globalThis as unknown as { Function: unknown; eval: unknown }
		const realFunction = host.Function
		const realEval = host.eval
		const reached: string[] = []
		host.Function = (): never => {
			reached.push('Function')
			throw new Error('Function is not available here')
		}
		host.eval = (): never => {
			reached.push('eval')
			throw new Error('eval is not available here')
		}
		let accepted = false
		let refused = false
		try {
			accepted = validateItem(await Bun.file(new URL('examples/item.jacket.json', SPEC)).json()).ok
			refused =
				!validateItem({ $type: 'org.prodid.item' }).ok &&
				!validateFeed({ $type: 'org.prodid.feed', version: 3 }).ok &&
				!validateEntity({ $type: 'org.prodid.entity', kind: 'family' }).ok &&
				!validateSource({ $type: 'org.prodid.source', trust: 'verified' }).ok &&
				!validateDump({ $type: 'org.prodid.dump', version: 1 }).ok
		} finally {
			host.Function = realFunction
			host.eval = realEval
		}
		expect(reached).toEqual([])
		expect(accepted).toBe(true)
		expect(refused).toBe(true)
	})
})

describe('strings the store cannot hold', () => {
	const base = {
		$type: 'org.prodid.item',
		key: 'TB-100',
		brand: 'Acme',
		name: 'Trail Bottle 1L',
		identifiers: [{ scheme: 'gtin', value: '9506000134420' }],
	}

	test('a lone surrogate is a validation error, so the line is skipped and the ingest survives', () => {
		const result = validateItem({ ...base, name: 'Trail Bottle \uD800' })
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors).toContainEqual(expect.objectContaining({ path: '/name', keyword: 'storable' }))
	})

	test('U+0000 is a validation error too, because jsonb refuses it', () => {
		const result = validateItem({ ...base, properties: { madeIn: 'T\u0000R' } })
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors).toContainEqual(expect.objectContaining({ path: '/properties/madeIn', keyword: 'storable' }))
	})

	test('finds one anywhere in the record, keys included', () => {
		expect(validateItem({ ...base, variant: { color: 'navy\uD800' } }).ok).toBe(false)
		expect(validateItem({ ...base, markets: ['T\uDC00'] }).ok).toBe(false)
		expect(validateItem({ ...base, media: [{ url: 'https://a.example/x', license: 'CC0-1.0\u0000' }] }).ok).toBe(false)
	})

	test('applies to every record type', () => {
		const claim = {
			property: 'brand',
			value: 'Acme',
			source: { name: 'a.example', trust: 'verified', lapsed: false },
			seen_at: '2026-09-19T10:00:00Z',
		}
		const entity = { $type: 'org.prodid.entity', opid: 'h027qsrdrp9c06x1', kind: 'family', identifiers: [], claims: [claim] }
		expect(validateEntity({ ...entity, claims: [{ ...claim, value: 'Acme\uD800' }] }).ok).toBe(false)
		expect(
			validateSource({ $type: 'org.prodid.source', name: 'a.example\u0000', kind: 'domain', trust: 'unverified', lapsed: false }).ok,
		).toBe(false)
		const feed = {
			$type: 'org.prodid.feed',
			version: 0,
			publisher: { name: 'Acme\uD800' },
			license: 'CC0-1.0',
			feeds: ['https://a.example/f.ndjson'],
		}
		expect(validateFeed(feed).ok).toBe(false)
	})

	test('a record that canonicalizes is a record that validated', async () => {
		const result = validateItem(base)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect((await canonicalHash(result.value)).length).toBe(64)
	})
})

describe('a gtin identifier must be a GTIN', () => {
	const base = { $type: 'org.prodid.item', key: 'TB-100', brand: 'Acme', name: 'Trail Bottle 1L' }

	test('rejects a wrong check digit and the all-zero placeholder', () => {
		for (const value of ['9506000134353', '0000000000000', '00000000', '000000000000']) {
			const result = validateItem({ ...base, identifiers: [{ scheme: 'gtin', value }] })
			expect(result.ok).toBe(false)
			if (result.ok) continue
			expect(result.errors).toContainEqual(expect.objectContaining({ path: '/identifiers/0/value', keyword: 'gtin' }))
		}
	})

	test('names the identifier that is wrong, not the first one', () => {
		const identifiers = [
			{ scheme: 'gtin', value: '9506000134420' },
			{ scheme: 'mpn', value: 'TJ-1' },
			{ scheme: 'gtin', value: '9506000134353' },
		]
		const result = validateItem({ ...base, identifiers })
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors).toContainEqual(expect.objectContaining({ path: '/identifiers/2/value', keyword: 'gtin' }))
	})

	test('keeps a restricted circulation number, which is stored rather than rejected', () => {
		expect(validateItem({ ...base, identifiers: [{ scheme: 'gtin', value: '2001234567893' }] }).ok).toBe(true)
	})
})

describe('what an entity may not say about itself', () => {
	const claim = {
		property: 'name',
		value: 'Trail Jacket',
		source: { name: 'acme.example', trust: 'verified', lapsed: false },
		seen_at: '2026-09-14T09:12:03Z',
	}
	const opid = '3n7k2q9vdfhb4mta'
	const other = '9p2d4kv7mq3nbhxf'
	const family = { $type: 'org.prodid.entity', opid, kind: 'family', identifiers: [], claims: [] }

	test('is never its own parent, child or survivor', () => {
		const variant = { ...family, kind: 'variant', opid: other }
		expect(validateEntity({ ...variant, parents: { family: other } }).ok).toBe(false)
		expect(validateEntity({ ...variant, parents: { family: opid } }).ok).toBe(true)
		expect(validateEntity({ ...family, merged_from: [opid] }).ok).toBe(false)
		expect(validateEntity({ ...family, merged_from: [other] }).ok).toBe(true)
		expect(validateEntity({ ...family, children: [opid] }).ok).toBe(false)
		const rejected = validateEntity({ ...family, merged_from: [opid] })
		expect(rejected.ok ? [] : rejected.errors).toContainEqual(
			expect.objectContaining({ path: '/merged_from/0', keyword: 'self-reference' }),
		)
	})

	test('never withdraws a claim before it was seen', () => {
		expect(validateEntity({ ...family, claims: [{ ...claim, withdrawn_at: '2026-05-03T11:20:00Z' }] }).ok).toBe(false)
		expect(validateEntity({ ...family, claims: [{ ...claim, withdrawn_at: '2026-09-14T09:12:03Z' }] }).ok).toBe(true)
		expect(validateEntity({ ...family, claims: [{ ...claim, withdrawn_at: '2027-01-01T00:00:00Z' }] }).ok).toBe(true)
	})

	test('serves a media claim under the digest it names', () => {
		const sha256 = 'e3943ea26ce08ae81809e62936dc4f934fa04da6cd57bd9ab2a90b79da751c09'
		const value = {
			sha256,
			url: 'https://acme.example/img/tj2041-navy.webp',
			media_url: `https://media.prodid.org/sha256/${sha256}`,
			license: 'CC-BY-4.0',
		}
		const media = { ...claim, property: 'media', lang: undefined, value }
		delete (media as { lang?: unknown }).lang
		expect(validateEntity({ ...family, claims: [media] }).ok).toBe(true)
		const mismatched = { ...media, value: { ...value, media_url: `https://media.prodid.org/sha256/${'0'.repeat(64)}` } }
		const rejected = validateEntity({ ...family, claims: [mismatched] })
		expect(rejected.ok ? [] : rejected.errors).toContainEqual(
			expect.objectContaining({ path: '/claims/0/value/media_url', keyword: 'digest' }),
		)
	})
})

describe('a record must keep an identifier the index can store', () => {
	const base = { $type: 'org.prodid.item', key: 'TB-100', name: 'Trail Bottle 1L' }

	test('refuses a record whose only identifier is an mpn with no brand to scope it', () => {
		// It normalized to nothing, matched nothing, and minted a fresh entity on every crawl.
		const result = validateItem({ ...base, brand: '   ', identifiers: [{ scheme: 'mpn', value: 'TB-100' }] })
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors).toContainEqual(expect.objectContaining({ path: '/identifiers', keyword: 'identifiable' }))
	})

	test('keeps the record when one other identifier survives', () => {
		const identifiers = [
			{ scheme: 'mpn', value: 'TB-100' },
			{ scheme: 'gtin', value: '9506000134420' },
		]
		expect(validateItem({ ...base, brand: '   ', identifiers }).ok).toBe(true)
		expect(validateItem({ ...base, brand: 'Acme', identifiers: [{ scheme: 'mpn', value: 'TB-100' }] }).ok).toBe(true)
		expect(validateItem({ ...base, brand: '   ', identifiers: [{ scheme: 'sku', value: 'S-1' }] }).ok).toBe(true)
		expect(validateItem({ ...base, brand: '   ', identifiers: [{ scheme: 'asin', value: 'B000000000' }] }).ok).toBe(true)
	})

	test('refuses a blank or padded identifier value before it gets that far', () => {
		for (const value of ['   ', ' TB-100', 'TB-100 ', '\t']) {
			const result = validateItem({ ...base, brand: 'Acme', identifiers: [{ scheme: 'sku', value }] })
			expect(result.ok).toBe(false)
			if (result.ok) continue
			expect(result.errors).toContainEqual(expect.objectContaining({ path: '/identifiers/0/value', keyword: 'pattern' }))
		}
	})

	test('a brand that normalizes to nothing does not cost a record with a gtin', () => {
		const derived = validateItem({ ...base, brand: '   ', identifiers: [{ scheme: 'gtin', value: '9506000134420' }] })
		expect(derived.ok).toBe(true)
	})
})

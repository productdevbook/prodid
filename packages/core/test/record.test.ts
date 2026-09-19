import { describe, expect, test } from 'bun:test'

import { canonicalHash } from '../src/canonical'
import { validateEntity, validateFeed, validateItem, validateSource, type ValidationResult } from '../src/record/index'

const SPEC = new URL('../../../spec/', import.meta.url)
const GENERATED = new URL('../src/record/validators.generated.js', import.meta.url)

async function fixtures(folder: string): Promise<string[]> {
	const names: string[] = []
	for await (const name of new Bun.Glob('*.json').scan({ cwd: new URL(folder, SPEC).pathname })) names.push(name)
	return names.sort()
}

function validateByName(name: string, value: unknown): ValidationResult<unknown> {
	if (name.startsWith('item.')) return validateItem(value)
	if (name.startsWith('entity.')) return validateEntity(value)
	if (name.startsWith('source.')) return validateSource(value)
	return validateFeed(value)
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
		const result = validateByName(name, await Bun.file(new URL(`fixtures/valid/${name}`, SPEC)).json())
		expect(result.ok ? [] : result.errors).toEqual([])
	})

	test.each(invalid)('refuses fixtures/invalid/%s for the reason the spec expects', async (name) => {
		const result = validateByName(name, await Bun.file(new URL(`fixtures/invalid/${name}`, SPEC)).json())
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
				!validateSource({ $type: 'org.prodid.source', trust: 'verified' }).ok
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

import { describe, expect, test } from 'bun:test'

import { validateFeed, validateItem } from '../src/record/index'

const SPEC = new URL('../../../spec/', import.meta.url)
const GENERATED = new URL('../src/record/validators.generated.js', import.meta.url)

async function fixtures(folder: string): Promise<string[]> {
	const names: string[] = []
	for await (const name of new Bun.Glob('*.json').scan({ cwd: new URL(folder, SPEC).pathname })) names.push(name)
	return names.sort()
}

function validateByName(name: string, value: unknown): ReturnType<typeof validateItem> | ReturnType<typeof validateFeed> {
	return name.startsWith('item.') ? validateItem(value) : validateFeed(value)
}

const valid = await fixtures('fixtures/valid/')
const invalid = await fixtures('fixtures/invalid/')
const expected = (await Bun.file(new URL('fixtures/expected.json', SPEC)).json()) as Record<
	string,
	{ instancePath: string; keyword: string }
>

describe('validateItem and validateFeed', () => {
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
			refused = !validateItem({ $type: 'org.prodid.item' }).ok && !validateFeed({ $type: 'org.prodid.feed', version: 3 }).ok
		} finally {
			host.Function = realFunction
			host.eval = realEval
		}
		expect(reached).toEqual([])
		expect(accepted).toBe(true)
		expect(refused).toBe(true)
	})
})

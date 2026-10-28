import { describe, expect, test } from 'bun:test'

import { MAX_PROBLEM_DETAIL, PROBLEM_BASE, PROBLEM_MAX_AGE, problem, PROBLEMS, type ProblemType } from '../src/problem'

const README = new URL('../../../spec/README.md', import.meta.url)

interface SpecTable {
	statuses: Record<string, number>
	retrying: Set<string>
	cacheable: Set<string>
}

/**
 * Reads the spec's own error table back out of `spec/README.md`: the rows of the problem table, the
 * sentence naming what carries `Retry-After`, and the sentence naming what may be cached. Each part
 * is anchored on wording that cannot move without the parse failing, so a rewrite is a failure
 * rather than a silent pass.
 */
async function specTable(): Promise<SpecTable> {
	const readme = await Bun.file(README).text()

	const statuses: Record<string, number> = {}
	for (const [, name, status] of readme.matchAll(/^\|\s*`…\/problem\/([a-z-]+)`\s*\|\s*`(\d{3})`\s*\|/gmu)) {
		statuses[name!] = Number(status)
	}

	const retrySentence = /^`([^`]+(?:`(?:,| and) `[^`]+)*)` carries `Retry-After`; nothing else does\.$/mu.exec(readme)
	if (retrySentence === null) throw new Error('spec/README.md: no sentence naming what carries Retry-After')

	const cacheSentence = /^((?:`[a-z-]+`(?:, | and )?)+) are decided by the request alone/mu.exec(readme)
	if (cacheSentence === null) throw new Error('spec/README.md: no sentence naming what may be cached')

	return {
		statuses,
		retrying: new Set(backticked(retrySentence[1]!)),
		cacheable: new Set(backticked(cacheSentence[1]!)),
	}
}

/** The names in a sentence's list, whether or not the capture kept their backticks. */
function backticked(text: string): string[] {
	return text
		.split(/`?(?:,\s*|\s+and\s+)`?/u)
		.map((part) => part.replaceAll('`', '').trim())
		.filter((part) => part !== '')
}

const table = await specTable()

describe('the problem table matches the spec', () => {
	test('the parse found a table to compare against', () => {
		expect(Object.keys(table.statuses).length).toBeGreaterThan(5)
		expect(table.retrying.size).toBeGreaterThan(0)
		expect(table.cacheable.size).toBeGreaterThan(0)
	})

	test('names exactly the problem types the spec lists', () => {
		expect(Object.keys(PROBLEMS).sort()).toEqual(Object.keys(table.statuses).sort())
	})

	test('gives each one the status the spec gives it', () => {
		for (const [type, status] of Object.entries(table.statuses)) {
			expect(PROBLEMS[type as ProblemType]?.status).toBe(status)
		}
	})

	test('carries Retry-After on exactly what the spec says carries it', () => {
		for (const type of Object.keys(PROBLEMS) as ProblemType[]) {
			expect(PROBLEMS[type].retryAfter).toBe(table.retrying.has(type))
		}
	})

	test('caches exactly what the request alone decides, per the spec', () => {
		for (const type of Object.keys(PROBLEMS) as ProblemType[]) {
			expect(PROBLEMS[type].cacheable).toBe(table.cacheable.has(type))
		}
		// The sentence names three; a set of two was the bug this guard exists to catch.
		expect([...table.cacheable].sort()).toEqual(['blocked-media', 'invalid-gtin', 'restricted-gtin'])
	})

	test('the guard notices a row that drifts', () => {
		const drifted = { ...PROBLEMS, 'not-found': { ...PROBLEMS['not-found'], status: 418 } }
		expect(drifted['not-found'].status).not.toBe(table.statuses['not-found'])
	})
})

describe('problem', () => {
	test('builds the document the spec shows', () => {
		expect(problem('unknown-opid')).toEqual({
			status: 404,
			headers: { 'content-type': 'application/problem+json; charset=utf-8', 'cache-control': 'no-store' },
			body: { type: 'https://prodid.org/problem/unknown-opid', title: 'No entity with that opid', status: 404 },
		})
	})

	test('caches only what the request alone decides', () => {
		for (const type of Object.keys(PROBLEMS) as ProblemType[]) {
			const built = type === 'rate-limited' ? problem(type, { retryAfterSeconds: 1 }) : problem(type)
			expect(built.headers['cache-control']).toBe(PROBLEMS[type].cacheable ? `public, max-age=${PROBLEM_MAX_AGE}` : 'no-store')
			expect(built.body.type).toBe(`${PROBLEM_BASE}${type}`)
			expect(built.status).toBe(PROBLEMS[type].status)
		}
	})

	test('carries Retry-After, as whole seconds', () => {
		expect(problem('rate-limited', { retryAfterSeconds: 30 }).headers['retry-after']).toBe('30')
		expect(problem('rate-limited', { retryAfterSeconds: 0 }).headers['retry-after']).toBe('0')
		expect(problem('rate-limited', { retryAfterSeconds: 1.2 }).headers['retry-after']).toBe('2')
	})

	test('refuses a Retry-After that is not a number of seconds', () => {
		expect(() => problem('rate-limited', { retryAfterSeconds: -1 })).toThrow(RangeError)
		expect(() => problem('rate-limited', { retryAfterSeconds: Number.NaN })).toThrow(RangeError)
		expect(() => problem('rate-limited', { retryAfterSeconds: Number.POSITIVE_INFINITY })).toThrow(RangeError)
	})

	test('sets Retry-After on nothing else', () => {
		for (const type of Object.keys(PROBLEMS) as ProblemType[]) {
			if (type === 'rate-limited') continue
			expect(problem(type).headers['retry-after']).toBeUndefined()
		}
	})

	test('bounds the detail so a caller cannot echo itself back unbounded', () => {
		const built = problem('invalid-request', { detail: 'x'.repeat(5000) })
		expect(built.body.detail?.length).toBe(MAX_PROBLEM_DETAIL)
		expect(problem('invalid-request', { detail: '  spaced  ' }).body.detail).toBe('spaced')
		expect(problem('invalid-request', { detail: '   ' }).body.detail).toBeUndefined()
		expect(problem('invalid-request').body.detail).toBeUndefined()
	})

	test('carries instance when it is given', () => {
		expect(problem('not-found', { instance: '/id/abc' }).body.instance).toBe('/id/abc')
		expect(problem('not-found').body.instance).toBeUndefined()
	})

	test('is the same document every time, for the same input', () => {
		expect(problem('blocked-media', { detail: 'x' })).toEqual(problem('blocked-media', { detail: 'x' }))
	})
})

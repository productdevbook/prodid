import { describe, expect, test } from 'bun:test'

import { etagMatches, ifModifiedSince, ifNoneMatch, isNotModified } from '../src/conditional'

const MODIFIED = new Date('2026-09-14T09:12:03.000Z')
const IMF = 'Mon, 14 Sep 2026 09:12:03 GMT'

describe('etagMatches', () => {
	test('compares weakly, as If-None-Match is defined to', () => {
		expect(etagMatches('"x"', '"x"')).toBe(true)
		expect(etagMatches('W/"x"', '"x"')).toBe(true)
		expect(etagMatches('"x"', 'W/"x"')).toBe(true)
		expect(etagMatches('W/"x"', 'W/"x"')).toBe(true)
	})

	test('refuses different opaque tags and anything that is not one', () => {
		expect(etagMatches('"x"', '"y"')).toBe(false)
		expect(etagMatches('x', '"x"')).toBe(false)
		expect(etagMatches('"x', '"x"')).toBe(false)
		expect(etagMatches('', '"x"')).toBe(false)
		expect(etagMatches('*', '"x"')).toBe(false)
	})
})

describe('ifNoneMatch', () => {
	test('matches a tag in the list, weakly', () => {
		expect(ifNoneMatch('"x"', '"x"')).toBe(true)
		expect(ifNoneMatch('W/"x"', '"x"')).toBe(true)
		expect(ifNoneMatch('"a", "b", W/"x"', '"x"')).toBe(true)
		expect(ifNoneMatch('  "a" ,  "x"  ', '"x"')).toBe(true)
	})

	test('* names any representation that exists', () => {
		expect(ifNoneMatch('*', '"x"')).toBe(true)
		expect(ifNoneMatch('*', null)).toBe(false)
	})

	test('does not match when the list has no such tag, or there is nothing to compare', () => {
		expect(ifNoneMatch('"a", "b"', '"x"')).toBe(false)
		expect(ifNoneMatch(null, '"x"')).toBe(false)
		expect(ifNoneMatch('', '"x"')).toBe(false)
		expect(ifNoneMatch('   ', '"x"')).toBe(false)
		expect(ifNoneMatch('"x"', undefined)).toBe(false)
	})
})

describe('ifModifiedSince', () => {
	test('says unchanged when the representation is no newer than the date', () => {
		expect(ifModifiedSince(IMF, MODIFIED)).toBe(true)
		expect(ifModifiedSince(IMF, new Date('2026-09-14T09:12:02.000Z'))).toBe(true)
		expect(ifModifiedSince(IMF, new Date('2026-01-01T00:00:00.000Z'))).toBe(true)
	})

	test('says changed when the representation is newer', () => {
		expect(ifModifiedSince(IMF, new Date('2026-09-14T09:12:04.000Z'))).toBe(false)
		expect(ifModifiedSince(IMF, new Date('2027-01-01T00:00:00.000Z'))).toBe(false)
	})

	test('drops anything finer than a second, which an HTTP date cannot carry', () => {
		expect(ifModifiedSince(IMF, new Date('2026-09-14T09:12:03.999Z'))).toBe(true)
	})

	test('refuses a date it cannot read, and a missing one on either side', () => {
		expect(ifModifiedSince('not a date', MODIFIED)).toBe(false)
		expect(ifModifiedSince(null, MODIFIED)).toBe(false)
		expect(ifModifiedSince('', MODIFIED)).toBe(false)
		expect(ifModifiedSince(IMF, null)).toBe(false)
		expect(ifModifiedSince(IMF, new Date(Number.NaN))).toBe(false)
	})
})

describe('isNotModified', () => {
	test('lets If-None-Match decide alone when it is present', () => {
		// The entity tag is the better validator, so a stale date must not override a tag that differs.
		expect(isNotModified({ ifNoneMatch: '"x"', ifModifiedSince: IMF }, { etag: '"x"', lastModified: MODIFIED })).toBe(true)
		expect(isNotModified({ ifNoneMatch: '"other"', ifModifiedSince: IMF }, { etag: '"x"', lastModified: MODIFIED })).toBe(false)
	})

	test('falls back to the date only when there is no If-None-Match', () => {
		expect(isNotModified({ ifModifiedSince: IMF }, { etag: '"x"', lastModified: MODIFIED })).toBe(true)
		expect(isNotModified({ ifNoneMatch: null, ifModifiedSince: IMF }, { lastModified: MODIFIED })).toBe(true)
		expect(isNotModified({ ifNoneMatch: '  ', ifModifiedSince: IMF }, { lastModified: MODIFIED })).toBe(true)
	})

	test('is false when a request carries no condition at all', () => {
		expect(isNotModified({}, { etag: '"x"', lastModified: MODIFIED })).toBe(false)
		expect(isNotModified({ ifNoneMatch: null, ifModifiedSince: null }, { etag: '"x"' })).toBe(false)
	})
})

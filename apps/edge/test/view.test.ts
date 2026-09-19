import { describe, expect, test } from 'bun:test'

import type { EntityRecord } from '@prodid/core'

import { renderEntity } from '../src/render'
import { entityView } from '../src/view'

const SOURCE = { name: 'acme.example', trust: 'verified' as const, lapsed: false }
const OTHER = { name: 'shop.example', trust: 'unverified' as const, lapsed: true }

function entity(claims: EntityRecord['claims']): EntityRecord {
	return {
		$type: 'org.prodid.entity',
		opid: 'kq7m3v9dn2hb4t5x',
		kind: 'item',
		parents: { family: '3n7k2q9vdfhb4mta', variant: '9p2d4kv7mq3nbhxf' },
		identifiers: [
			{ scheme: 'gtin', value: '09506000134352' },
			{ scheme: 'sku', value: 'TJ-NV-M', scope: 'acme.example' },
		],
		claims,
	}
}

describe('the entity view-model', () => {
	test('names and brands come out separately, each attributed', () => {
		const view = entityView(
			entity([
				{ property: 'name', value: 'Trail Jacket', lang: 'en', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'name', value: 'Trekkingjacke', lang: 'de', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'brand', value: 'Acme', lang: 'en', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
			]),
		)
		expect(view.names.map((entry) => entry.lang)).toEqual(['en', 'de'])
		expect(view.brands).toHaveLength(1)
		expect(view.names[0]?.source).toEqual({ ...SOURCE, href: '/source/acme.example' })
		expect(view.properties).toHaveLength(0)
	})

	test('two sources disagreeing stand side by side under one property', () => {
		const view = entityView(
			entity([
				{ property: 'properties.weight', value: 480, source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'properties.weight', value: 512, source: OTHER, seen_at: '2026-09-15T09:12:03Z' },
				{ property: 'variant.color', value: 'Navy', lang: 'en', source: SOURCE, seen_at: '2026-09-14T09:12:03Z' },
				{ property: 'variant.color', value: 'Navy', lang: 'en', source: OTHER, seen_at: '2026-09-15T09:12:03Z' },
			]),
		)
		const weight = view.properties.find((property) => property.property === 'properties.weight')!
		expect(weight.key).toBe('weight')
		expect(weight.values).toHaveLength(2)
		expect(weight.disagreement).toBe(true)

		// Agreeing is not disagreeing, however many sources say it.
		const color = view.properties.find((property) => property.property === 'variant.color')!
		expect(color.disagreement).toBe(false)
		expect(view.hasLapsedSource).toBe(true)
	})

	test('media comes out as thumbnails with the licence and the source', () => {
		const value = {
			sha256: 'e'.repeat(64),
			url: 'https://acme.example/navy.webp',
			media_url: `https://media.prodid.org/sha256/${'e'.repeat(64)}`,
			license: 'CC-BY-4.0',
			kind: 'image' as const,
		}
		const view = entityView(entity([{ property: 'media', value, source: SOURCE, seen_at: '2026-09-14T09:12:03Z' }]))
		expect(view.media).toHaveLength(1)
		expect(view.media[0]?.mediaUrl).toBe(value.media_url)
		expect(view.media[0]?.sourceUrl).toBe(value.url)
		expect(view.properties.some((property) => property.property === 'media')).toBe(false)
	})

	test('navigation is opids with the links already made', () => {
		const record = entity([])
		record.children = []
		record.merged_from = ['9p2d4kv7mq3nbhxg']
		const view = entityView(record)
		expect(view.navigation.family?.href).toBe('/id/3n7k2q9vdfhb4mta')
		expect(view.navigation.mergedFrom[0]?.href).toBe('/id/9p2d4kv7mq3nbhxg')
	})
})

describe('the renderer', () => {
	test('a hostile value introduces no tag and no attribute', () => {
		const payloads = [
			'<script>alert(1)</script>',
			'"><img src=x onerror=alert(1)>',
			"';alert(1);//",
			'<svg/onload=alert(1)>',
			'</table><script>x</script>',
		]
		for (const payload of payloads) {
			const html = renderEntity(
				entity([{ property: 'name', value: payload, lang: 'en', source: { ...SOURCE, name: payload }, seen_at: '2026-09-14T09:12:03Z' }]),
			)
			for (const opener of ['<script', '<img', '<svg', '<iframe']) expect(html.toLowerCase()).not.toContain(opener)
			// Anything that could open markup comes out escaped. A payload made only of characters
			// that cannot is plain text and stays as it is, which is the correct answer for it.
			if (/[<>"&]/.test(payload)) expect(html).not.toContain(payload)
		}
	})

	test('a media entry renders as an image from media.prodid.org', () => {
		const value = {
			sha256: 'a'.repeat(64),
			url: 'https://acme.example/navy.webp',
			media_url: `https://media.prodid.org/sha256/${'a'.repeat(64)}`,
			license: 'CC-BY-4.0',
			kind: 'image' as const,
		}
		const html = renderEntity(entity([{ property: 'media', value, source: SOURCE, seen_at: '2026-09-14T09:12:03Z' }]))
		expect(html).toContain(`<img src="https://media.prodid.org/sha256/${'a'.repeat(64)}"`)
	})
})

import type { EntityRecord, JsonValue, MediaValue, SourceRecord, Trust } from '@prodid/core'

/**
 * What an entity page shows, as plain data. `render.ts` is one renderer of this and `apps/web` will
 * be another; neither of them should have to know how a claim is stored or how a merge is followed.
 *
 * Everything a reader sees is attributed: there is no bare value anywhere in here, and two sources
 * that disagree appear side by side under one property rather than one of them winning.
 */
export interface SourceView {
	name: string
	trust: Trust
	lapsed: boolean
	/** Where the full status of this source lives. */
	href: string
}

export interface ValueView {
	value: JsonValue
	/** Set only on text the publisher wrote. */
	lang: string | null
	source: SourceView
	seenAt: string
	/** Set on a withdrawn claim, which is returned only with `?history=1`. */
	withdrawnAt: string | null
}

export interface PropertyView {
	/** The namespaced property name: `name`, `brand`, `variant.color`, `properties.weight`. */
	property: string
	/** The publisher's own key for a `variant.*` or `properties.*` property, else null. */
	key: string | null
	values: ValueView[]
	/** Two sources assert different values for this property. Both are shown; neither wins. */
	disagreement: boolean
}

export interface MediaView {
	sha256: string
	/** Where the index serves the stored copy. Immutable, safe to use as a thumbnail source. */
	mediaUrl: string
	/** Where the source published it, which may have changed or gone since. */
	sourceUrl: string
	license: string
	kind: 'image' | 'document' | null
	source: SourceView
	seenAt: string
	withdrawnAt: string | null
}

export interface LinkView {
	opid: string
	href: string
}

export interface EntityView {
	opid: string
	kind: 'family' | 'variant' | 'item'
	/** The names asserted for this entity, in the order the resolver returned them. */
	names: ValueView[]
	brands: ValueView[]
	identifiers: { scheme: string; value: string; scope: string | null }[]
	navigation: {
		family: LinkView | null
		variant: LinkView | null
		children: LinkView[]
		/** Opids merged into this one; each of them resolves here with a 308. */
		mergedFrom: LinkView[]
	}
	/** Everything except `name`, `brand` and `media`, grouped by property. */
	properties: PropertyView[]
	media: MediaView[]
	/** True when any claim on the page comes from a source that has lapsed. */
	hasLapsedSource: boolean
}

export interface SourceStatusView {
	name: string
	kind: SourceRecord['kind']
	trust: Trust
	verifiedBy: string | null
	verifiedAt: string | null
	lapsed: boolean
	lapsedAt: string | null
	license: string | null
	lastCrawl: {
		at: string
		outcome: SourceRecord['trust'] extends never ? never : 'success' | 'definite-negative' | 'transport-failure'
		via: string | null
		documentUrl: string | null
		httpStatus: number | null
		recordsSeen: number | null
		recordsChanged: number | null
		linesSkipped: number | null
		feedsFailed: number | null
	} | null
}

export function entityView(entity: EntityRecord): EntityView {
	const grouped = new Map<string, ValueView[]>()
	const media: MediaView[] = []
	let hasLapsedSource = false

	for (const claim of entity.claims) {
		const source: SourceView = {
			name: claim.source.name,
			trust: claim.source.trust,
			lapsed: claim.source.lapsed,
			href: `/source/${encodeURIComponent(claim.source.name)}`,
		}
		if (claim.source.lapsed) hasLapsedSource = true
		const seen: ValueView = {
			value: claim.value,
			lang: claim.lang ?? null,
			source,
			seenAt: claim.seen_at,
			withdrawnAt: claim.withdrawn_at ?? null,
		}
		if (claim.property === 'media') {
			const value = claim.value as unknown as MediaValue
			media.push({
				sha256: value.sha256,
				mediaUrl: value.media_url,
				sourceUrl: value.url,
				license: value.license,
				kind: value.kind ?? null,
				source,
				seenAt: claim.seen_at,
				withdrawnAt: claim.withdrawn_at ?? null,
			})
			continue
		}
		const bucket = grouped.get(claim.property)
		if (bucket === undefined) grouped.set(claim.property, [seen])
		else bucket.push(seen)
	}

	const parents = entity.parents ?? {}
	return {
		opid: entity.opid,
		kind: entity.kind,
		names: grouped.get('name') ?? [],
		brands: grouped.get('brand') ?? [],
		identifiers: entity.identifiers.map((identifier) => ({
			scheme: identifier.scheme,
			value: identifier.value,
			scope: identifier.scope ?? null,
		})),
		navigation: {
			family: link(parents.family),
			variant: link(parents.variant),
			children: (entity.children ?? []).map((opid) => link(opid)!),
			mergedFrom: (entity.merged_from ?? []).map((opid) => link(opid)!),
		},
		properties: [...grouped.entries()]
			.filter(([property]) => property !== 'name' && property !== 'brand')
			.map(([property, values]) => ({
				property,
				key: property.includes('.') ? property.slice(property.indexOf('.') + 1) : null,
				values,
				disagreement: distinct(values) > 1,
			})),
		media,
		hasLapsedSource,
	}
}

export function sourceStatusView(status: SourceRecord): SourceStatusView {
	const crawl = status.last_crawl
	return {
		name: status.name,
		kind: status.kind,
		trust: status.trust,
		verifiedBy: status.verified_by ?? null,
		verifiedAt: status.verified_at ?? null,
		lapsed: status.lapsed,
		lapsedAt: status.lapsed_at ?? null,
		license: status.license ?? null,
		lastCrawl:
			crawl === undefined
				? null
				: {
						at: crawl.at,
						outcome: crawl.outcome,
						via: crawl.via ?? null,
						documentUrl: crawl.document_url ?? null,
						httpStatus: crawl.http_status ?? null,
						recordsSeen: crawl.records_seen ?? null,
						recordsChanged: crawl.records_changed ?? null,
						linesSkipped: crawl.lines_skipped ?? null,
						feedsFailed: crawl.feeds_failed ?? null,
					},
	}
}

/** Two sources saying the same thing is agreement; the count is of distinct values, not of claims. */
function distinct(values: readonly ValueView[]): number {
	return new Set(values.filter((entry) => entry.withdrawnAt === null).map((entry) => JSON.stringify(entry.value))).size
}

function link(opid: string | undefined): LinkView | null {
	return opid === undefined ? null : { opid, href: `/id/${opid}` }
}

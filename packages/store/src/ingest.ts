import { canonicalize, type EntityKind, mintOpid, type NormalizedIdentifier } from '@prodid/core'

import type { Sql, TransactionSql } from './client'
import { withRetry } from './client'
import type { PreparedRecord } from './prepare'

/** Two of a record's identifiers naming different entities. The most specific global one wins and nothing is merged. */
export interface Disagreement {
	key: string
	chosen: string
	others: string[]
}

export interface RecordOutcome {
	key: string
	opid: string
	changed: boolean
	claimsInserted: number
	claimsWithdrawn: number
	disagreement: Disagreement | null
}

export interface IngestResult {
	seen: number
	changed: number
	claimsInserted: number
	claimsWithdrawn: number
	disagreements: Disagreement[]
	keys: string[]
}

interface Match {
	scheme: string
	scope: string
	value: string
	target: string
	kind: EntityKind
	parent: string | null
}

interface ClaimRow {
	id: string
	opid: string
	property: string
	lang: string | null
	/** `jsonb` as text. postgres.js decides for itself whether to parse a jsonb column; this does not. */
	value: string
}

/**
 * Ingests validated records for one source. Each record is its own transaction: a record's entity,
 * identifiers, grouping, body and claim diff belong together, while two records do not, and a
 * batch-wide transaction would make two crawls of overlapping catalogues wait on each other.
 */
export async function ingestRecords(
	sql: Sql,
	input: { source: string; feed: string | null; records: readonly PreparedRecord[]; now: Date },
): Promise<IngestResult> {
	const result: IngestResult = { seen: 0, changed: 0, claimsInserted: 0, claimsWithdrawn: 0, disagreements: [], keys: [] }
	for (const prepared of input.records) {
		const outcome = await ingestRecord(sql, { source: input.source, feed: input.feed, record: prepared, now: input.now })
		result.seen += 1
		result.keys.push(outcome.key)
		if (outcome.changed) result.changed += 1
		result.claimsInserted += outcome.claimsInserted
		result.claimsWithdrawn += outcome.claimsWithdrawn
		if (outcome.disagreement !== null) result.disagreements.push(outcome.disagreement)
	}
	return result
}

export function ingestRecord(
	sql: Sql,
	input: { source: string; feed?: string | null; record: PreparedRecord; now: Date },
): Promise<RecordOutcome> {
	// Defence in depth behind the same rule in `prepareRecord`: an entity minted for a record that
	// can never be found again is an orphan the next crawl repeats.
	if (input.record.identifiers.length === 0) {
		throw new RangeError(`record ${input.record.record.key} has no identifier that survives normalization`)
	}
	return withRetry(() => sql.begin((tx) => ingestOnce(tx, input.source, input.feed ?? null, input.record, input.now)))
}

async function ingestOnce(
	tx: TransactionSql,
	source: string,
	feed: string | null,
	prepared: PreparedRecord,
	now: Date,
): Promise<RecordOutcome> {
	const key = prepared.record.key
	const matches = await resolveIdentifiers(tx, prepared.identifiers)
	const items = matches.filter((match) => match.kind === 'item')

	const distinct = [...new Set(items.map((match) => match.target))]
	let opid = distinct.length === 0 ? null : chooseItem(items)
	const disagreement: Disagreement | null =
		distinct.length > 1 ? { key, chosen: opid!, others: distinct.filter((other) => other !== opid) } : null

	const mapped = await readGroupings(tx, source, prepared)

	if (opid === null) {
		let variant = mapped.variant
		if (variant === null) {
			let family = mapped.family
			if (family === null) {
				family = mintOpid()
				await insertEntity(tx, family, 'family', null, now)
				await insertGrouping(tx, source, 'family', prepared.familyKey, family)
			}
			variant = mintOpid()
			await insertEntity(tx, variant, 'variant', family, now)
			await insertGrouping(tx, source, 'variant', prepared.variantKey, variant)
		} else if (mapped.family === null) {
			// The variant's own family is the truth; the unmapped family key adopts it.
			await insertGrouping(tx, source, 'family', prepared.familyKey, await parentOf(tx, variant))
		}
		opid = mintOpid()
		await insertEntity(tx, opid, 'item', variant, now)
	} else {
		// The item already exists, so its parents decide: an unmapped grouping key of this source
		// adopts them, and a mapping that disagrees leaves the item exactly where it is.
		const variant = items.find((match) => match.target === opid)?.parent ?? null
		if (variant !== null) {
			if (mapped.variant === null) await insertGrouping(tx, source, 'variant', prepared.variantKey, variant)
			if (mapped.family === null) await insertGrouping(tx, source, 'family', prepared.familyKey, await parentOf(tx, variant))
		}
	}

	await insertIdentifiers(tx, source, opid, prepared.identifiers, matches, now)
	const changedBody = await upsertRecord(tx, source, feed, prepared, opid, now)
	const diff = await diffClaims(tx, source, key, opid, prepared, now)

	return {
		key,
		opid,
		changed: changedBody || diff.inserted > 0 || diff.withdrawn > 0,
		claimsInserted: diff.inserted,
		claimsWithdrawn: diff.withdrawn,
		disagreement,
	}
}

async function resolveIdentifiers(tx: TransactionSql, identifiers: readonly NormalizedIdentifier[]): Promise<Match[]> {
	if (identifiers.length === 0) return []
	const schemes = identifiers.map((identifier) => identifier.scheme)
	const scopes = identifiers.map((identifier) => identifier.scope)
	const values = identifiers.map((identifier) => identifier.value)
	return await tx<Match[]>`
		select i.scheme, i.scope, i.value, t.opid as target, t.kind, t.parent
		from identifier i
		join entity e on e.opid = i.opid
		join entity t on t.opid = coalesce(e.merged_into, i.opid)
		where (i.scheme, i.scope, i.value) in (
			select * from unnest(${schemes}::text[], ${scopes}::text[], ${values}::text[])
		)
	`
}

/** `gtin` before every other global scheme, and a global scheme before one scoped to a brand or a source. */
function specificity(match: Match): number {
	if (match.scheme === 'gtin') return 0
	return match.scope === '' ? 1 : 2
}

function chooseItem(items: Match[]): string {
	const ranked = [...items].sort((left, right) => {
		const bySpecificity = specificity(left) - specificity(right)
		if (bySpecificity !== 0) return bySpecificity
		return left.scheme === right.scheme ? left.value.localeCompare(right.value) : left.scheme.localeCompare(right.scheme)
	})
	return ranked[0]!.target
}

async function readGroupings(
	tx: TransactionSql,
	source: string,
	prepared: PreparedRecord,
): Promise<{ family: string | null; variant: string | null }> {
	const rows = await tx<{ kind: EntityKind; key: string; opid: string }[]>`
		select kind, key, opid from grouping
		where source = ${source} and (kind, key) in (
			select * from unnest(array['family','variant']::text[], ${[prepared.familyKey, prepared.variantKey]}::text[])
		)
	`
	return {
		family: rows.find((row) => row.kind === 'family')?.opid ?? null,
		variant: rows.find((row) => row.kind === 'variant')?.opid ?? null,
	}
}

async function parentOf(tx: TransactionSql, opid: string): Promise<string> {
	const rows = await tx<{ parent: string | null }[]>`select parent from entity where opid = ${opid}`
	const parent = rows[0]?.parent
	if (parent == null) throw new Error(`entity ${opid} has no parent`)
	return parent
}

async function insertEntity(tx: TransactionSql, opid: string, kind: EntityKind, parent: string | null, now: Date): Promise<void> {
	await tx`insert into entity (opid, kind, parent, created_at) values (${opid}, ${kind}, ${parent}, ${now})`
}

/**
 * No `on conflict`: the loser of a race must take its freshly minted entity down with it. Swallowing
 * the conflict and re-reading the winner's opid would leave that entity behind forever, and entities
 * are never deleted.
 */
async function insertGrouping(tx: TransactionSql, source: string, kind: 'family' | 'variant', key: string, opid: string): Promise<void> {
	await tx`insert into grouping (source, kind, key, opid) values (${source}, ${kind}, ${key}, ${opid})`
}

async function insertIdentifiers(
	tx: TransactionSql,
	source: string,
	opid: string,
	identifiers: readonly NormalizedIdentifier[],
	matches: readonly Match[],
	now: Date,
): Promise<void> {
	const known = new Set(matches.map((match) => triple(match)))
	const fresh = identifiers.filter((identifier) => !known.has(triple(identifier)))
	if (fresh.length === 0) return
	await tx`
		insert into identifier (scheme, scope, value, opid, first_source, first_seen)
		select u.scheme, u.scope, u.value, ${opid}, ${source}, ${now}
		from unnest(
			${fresh.map((identifier) => identifier.scheme)}::text[],
			${fresh.map((identifier) => identifier.scope)}::text[],
			${fresh.map((identifier) => identifier.value)}::text[]
		) as u(scheme, scope, value)
	`
}

function triple(identifier: { scheme: string; scope: string; value: string }): string {
	return `${identifier.scheme}\u0000${identifier.scope}\u0000${identifier.value}`
}

/**
 * The `::text` before `::jsonb` is not decoration: postgres.js types a parameter feeding a `::jsonb`
 * cast as jsonb and JSON-encodes it, which would store the document as a jsonb *string* instead of
 * the object. Going through `text` makes Postgres parse it, as it does for the claim values that
 * arrive through `unnest(… ::text[])`.
 */
async function upsertRecord(
	tx: TransactionSql,
	source: string,
	feed: string | null,
	prepared: PreparedRecord,
	opid: string,
	now: Date,
): Promise<boolean> {
	const rows = await tx<{ hash: string; opid: string; feed: string | null; withdrawn_at: Date | null }[]>`
		select hash, opid, feed, withdrawn_at from record where source = ${source} and key = ${prepared.record.key} for update
	`
	const previous = rows[0]
	if (previous === undefined) {
		await tx`
			insert into record (source, key, feed, opid, hash, body, first_seen, last_seen)
			values (
				${source}, ${prepared.record.key}, ${feed}, ${opid}, ${prepared.hash},
				${prepared.canonical}::text::jsonb, ${now}, ${now}
			)
		`
		return true
	}
	// The feed moves with the record: a key that changed file is withdrawn by neither of them.
	await tx`
		update record set opid = ${opid}, feed = ${feed}, hash = ${prepared.hash},
			body = ${prepared.canonical}::text::jsonb, last_seen = ${now}, withdrawn_at = null
		where source = ${source} and key = ${prepared.record.key}
	`
	return previous.hash !== prepared.hash || previous.opid !== opid || previous.withdrawn_at !== null
}

/**
 * The diff that makes `seen_at` mean what the spec says: a claim asserted again is not touched, one
 * no longer asserted is withdrawn, and only a genuinely new one is inserted.
 */
async function diffClaims(
	tx: TransactionSql,
	source: string,
	key: string,
	opid: string,
	prepared: PreparedRecord,
	now: Date,
): Promise<{ inserted: number; withdrawn: number }> {
	const current = await tx<ClaimRow[]>`
		select id::text, opid, property, lang, value::text as value from claim
		where source = ${source} and record_key = ${key} and withdrawn_at is null
	`

	const active = new Map<string, string>()
	for (const row of current) active.set(claimKey(row.opid, row.property, row.lang, canonicalOf(row.value)), row.id)

	const wanted = new Map<string, { property: string; lang: string | null; canonical: string }>()
	for (const claim of prepared.claims) wanted.set(claimKey(opid, claim.property, claim.lang, claim.canonical), claim)

	const stale = [...active.entries()].filter(([identity]) => !wanted.has(identity)).map(([, id]) => id)
	const fresh = [...wanted.entries()].filter(([identity]) => !active.has(identity)).map(([, claim]) => claim)

	if (stale.length > 0) {
		await tx`update claim set withdrawn_at = ${now} where id = any(${stale}::bigint[])`
	}
	if (fresh.length > 0) {
		await tx`
			insert into claim (opid, property, value, lang, source, record_key, seen_at)
			select ${opid}, u.property, u.value::jsonb, u.lang, ${source}, ${key}, ${now}
			from unnest(
				${fresh.map((claim) => claim.property)}::text[],
				${fresh.map((claim) => claim.canonical)}::text[],
				${fresh.map((claim) => claim.lang)}::text[]
			) as u(property, value, lang)
		`
	}
	return { inserted: fresh.length, withdrawn: stale.length }
}

function claimKey(opid: string, property: string, lang: string | null, canonical: string): string {
	return `${opid}\u0000${property}\u0000${lang ?? ''}\u0000${canonical}`
}

function canonicalOf(text: string): string {
	try {
		return canonicalize(JSON.parse(text))
	} catch {
		// A stored value with no canonical form cannot equal anything this writer produces.
		return `\u0000unrepresentable:${text}`
	}
}

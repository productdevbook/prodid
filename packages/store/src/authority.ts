import { normalizeBrand } from '@prodid/core'

import type { Sql } from './client'

export interface AuthorityGrant {
	id: string
	/** The source's name. */
	source: string
	/** Normalized, as identifiers' brand scopes are. */
	brand: string
	evidence: string
	decided_by: string
	decided_at: Date
	revoked_at: Date | null
}

export interface GrantInput {
	/** The source's name: a domain that is verified. */
	source: string
	brand: string
	/** The public lookup URL the grant is made on. */
	evidence: string
	decidedBy: string
	now: Date
}

const GRANT_COLUMNS = `a.id::text, s.name as source, a.brand, a.evidence, a.decided_by, a.decided_at, a.revoked_at`

/**
 * Grants a verified domain `authoritative` for one brand. A brand it already holds an unrevoked grant
 * for is not granted twice: that grant is returned, with `created: false`.
 */
export async function grantAuthority(sql: Sql, input: GrantInput): Promise<{ grant: AuthorityGrant; created: boolean }> {
	const brand = normalizeBrand(input.brand)
	if (brand === '') throw new RangeError('a grant names a brand')
	if (!input.evidence.startsWith('https://') || !URL.canParse(input.evidence)) {
		throw new RangeError(`the evidence is a public https URL: ${JSON.stringify(input.evidence)}`)
	}
	if (input.decidedBy.trim() === '') throw new RangeError('a grant is decided by someone')
	return (await sql.begin(async (tx) => {
		const [source] = await tx<{ id: string; kind: string; trust: string }[]>`
			select id::text, kind, trust from source where name = ${input.source} for share
		`
		if (source === undefined) throw new RangeError(`no source is named ${input.source}`)
		if (source.kind !== 'domain' || source.trust === 'unverified') {
			throw new RangeError(`${input.source} is not a verified domain, so it cannot be granted authority`)
		}
		const inserted = await tx<{ id: string }[]>`
			insert into authority (source, brand, evidence, decided_by, decided_at)
			values (${source.id}, ${brand}, ${input.evidence}, ${input.decidedBy}, ${input.now})
			on conflict (source, brand) where revoked_at is null do nothing
			returning id::text
		`
		const [grant] = await tx<AuthorityGrant[]>`
			select ${tx.unsafe(GRANT_COLUMNS)} from authority a join source s on s.id = a.source
			where a.source = ${source.id} and a.brand = ${brand} and a.revoked_at is null
		`
		if (grant === undefined) throw new Error(`the grant of ${brand} to ${input.source} was not written`)
		return { grant, created: inserted.length > 0 }
	})) as { grant: AuthorityGrant; created: boolean }
}

/** Revokes one grant. A grant that is already revoked keeps its first `revoked_at`; an unknown id is null. */
export async function revokeAuthority(sql: Sql, input: { id: string; now: Date }): Promise<AuthorityGrant | null> {
	if (!/^[0-9]+$/.test(input.id)) return null
	await sql`update authority set revoked_at = ${input.now} where id = ${input.id}::bigint and revoked_at is null`
	const [grant] = await sql<AuthorityGrant[]>`
		select ${sql.unsafe(GRANT_COLUMNS)} from authority a join source s on s.id = a.source where a.id = ${input.id}::bigint
	`
	return grant ?? null
}

/** Every grant a source was given, revoked ones included, oldest first. */
export async function listAuthority(sql: Sql, source: string): Promise<AuthorityGrant[]> {
	return await sql<AuthorityGrant[]>`
		select ${sql.unsafe(GRANT_COLUMNS)} from authority a join source s on s.id = a.source
		where s.name = ${source} order by a.decided_at, a.id
	`
}

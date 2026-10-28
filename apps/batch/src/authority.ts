import { normalizeBrand } from '@prodid/core'
import { type AuthorityGrant, grantAuthority, readSourceStatus, revokeAuthority, type Sql } from '@prodid/store'

import { type MergeEnv, type RunOptions, withDatabase } from './merge'

export class AuthorityError extends Error {}

export function parseBrand(value: string): string {
	if (normalizeBrand(value) === '') throw new AuthorityError('the brand is empty')
	return value
}

export function parseEvidence(value: string): string {
	if (!value.startsWith('https://') || !URL.canParse(value)) throw new AuthorityError(`--evidence ${value} is not an https URL`)
	return value
}

export function parseGrantId(value: string): string {
	if (!/^[1-9][0-9]*$/.test(value)) throw new AuthorityError(`${value} is not a grant id`)
	return value
}

export interface GrantCommand {
	source: string
	brand: string
	evidence: string
	now: Date
}

export async function runGrantAuthority(env: MergeEnv, input: GrantCommand, options: RunOptions = {}): Promise<void> {
	const log = options.log ?? console.log
	log(`database: ${new URL(env.DATABASE_URL).host}`)

	await withDatabase(env.DATABASE_URL, async (sql) => {
		const { grant, created } = await grantAuthority(sql, { ...input, decidedBy: env.PRODID_OPERATOR }).catch(refusal)
		log(`grant: ${grant.id}${created ? '' : ', already held'}`)
		describe(grant, log)
		log(`trust: ${await trustOf(sql, grant.source)}`)
	})
}

export async function runRevokeAuthority(
	databaseUrl: string,
	input: { id: string; reason: string; now: Date },
	options: RunOptions = {},
): Promise<void> {
	const log = options.log ?? console.log
	log(`database: ${new URL(databaseUrl).host}`)

	await withDatabase(databaseUrl, async (sql) => {
		const grant = await revokeAuthority(sql, input).catch(refusal)
		if (grant === null) throw new AuthorityError(`no grant has id ${input.id}`)
		log(`revoked: ${grant.id}${grant.revoked_at?.getTime() === input.now.getTime() ? '' : ', already revoked'}`)
		describe(grant, log)
		log(`trust: ${await trustOf(sql, grant.source)}`)
	})
}

function describe(grant: AuthorityGrant, log: (line: string) => void): void {
	log(`source: ${grant.source}`)
	log(`brand: ${JSON.stringify(grant.brand)}`)
	log(`evidence: ${grant.evidence}`)
	log(`decided: ${grant.decided_at.toISOString()} by ${grant.decided_by}`)
	if (grant.revoked_at !== null) log(`revoked at: ${grant.revoked_at.toISOString()}, ${JSON.stringify(grant.revoked_reason)}`)
}

async function trustOf(sql: Sql, source: string): Promise<string> {
	const status = await readSourceStatus(sql, source)
	if (status === null) return 'unknown'
	return status.lapsed ? `${status.trust}, lapsed since ${status.lapsed_at}` : status.trust
}

function refusal(error: unknown): never {
	if (error instanceof RangeError) throw new AuthorityError(error.message)
	throw error
}

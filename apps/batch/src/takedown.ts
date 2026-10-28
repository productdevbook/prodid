import { MEDIA_URL_PREFIX } from '@prodid/core'
import { blockMedia, createClient } from '@prodid/store'

export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

const ENV_NAMES = [
	'DATABASE_URL',
	'R2_ENDPOINT',
	'R2_ACCESS_KEY_ID',
	'R2_SECRET_ACCESS_KEY',
	'R2_MEDIA_BUCKET',
	'CLOUDFLARE_API_TOKEN',
	'CLOUDFLARE_ZONE_ID',
] as const

export type TakedownEnv = Record<(typeof ENV_NAMES)[number], string>

export class TakedownError extends Error {}

export function takedownEnv(env: Record<string, string | undefined>): TakedownEnv {
	if (env.DATABASE_URL === undefined || env.DATABASE_URL === '') throw new TakedownError('DATABASE_URL is not set')
	const missing = ENV_NAMES.filter((name) => env[name] === undefined || env[name] === '')
	if (missing.length > 0) throw new TakedownError(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set`)
	return Object.fromEntries(ENV_NAMES.map((name) => [name, env[name]!])) as TakedownEnv
}

export function parseDigest(value: string): string {
	const hex = value.toLowerCase()
	if (!/^[0-9a-f]{64}$/.test(hex)) throw new TakedownError(`${value} is not a sha256 hex digest`)
	return hex
}

export interface BlockMediaInput {
	sha256: string
	reason: string
	now: Date
}

export interface BlockMediaOptions {
	cloudflareApi?: string
	log?: (line: string) => void
	send?: (request: Request) => Promise<Response>
}

/**
 * The four takedown steps. The block comes first and stops the run when it fails; the delete and
 * the purge are each tried regardless of the other, and every step is safe to repeat.
 */
export async function runBlockMedia(env: TakedownEnv, input: BlockMediaInput, options: BlockMediaOptions = {}): Promise<boolean> {
	const log = options.log ?? console.log
	const send = options.send ?? ((request: Request) => fetch(request))
	log(`database: ${new URL(env.DATABASE_URL).host}`)

	const sql = createClient(env.DATABASE_URL, { max: 1, onnotice: () => {} })
	try {
		const withdrawn = await blockMedia(sql, input)
		log(`block: ok, ${withdrawn} ${withdrawn === 1 ? 'claim' : 'claims'} withdrawn`)
	} catch (error) {
		log(`block: failed, ${message(error)}`)
		return false
	} finally {
		await sql.end({ timeout: 5 })
	}

	const key = `sha256/${input.sha256}`
	let ok = true
	try {
		const bucket = new Bun.S3Client({
			endpoint: env.R2_ENDPOINT,
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY,
			bucket: env.R2_MEDIA_BUCKET,
			region: 'auto',
		})
		await bucket.delete(key)
		log(`delete: ok, ${env.R2_MEDIA_BUCKET}/${key}`)
	} catch (error) {
		log(`delete: failed, ${message(error)}`)
		ok = false
	}

	const url = `${MEDIA_URL_PREFIX}${input.sha256}`
	try {
		await purge(send, options.cloudflareApi ?? CLOUDFLARE_API, env, url)
		log(`purge: ok, ${url}`)
	} catch (error) {
		log(`purge: failed, ${message(error)}`)
		ok = false
	}
	return ok
}

async function purge(send: (request: Request) => Promise<Response>, api: string, env: TakedownEnv, url: string): Promise<void> {
	const response = await send(
		new Request(`${api}/zones/${encodeURIComponent(env.CLOUDFLARE_ZONE_ID)}/purge_cache`, {
			method: 'POST',
			headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
			body: JSON.stringify({ files: [url] }),
		}),
	)
	const body = (await response.json().catch(() => null)) as { success?: unknown; errors?: { code?: unknown; message?: unknown }[] } | null
	if (response.ok && body?.success === true) return
	const errors = (body?.errors ?? []).map((error) => `${String(error.code)} ${String(error.message)}`).join('; ')
	throw new Error(`Cloudflare answered ${response.status}${errors === '' ? '' : `: ${errors}`}`)
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

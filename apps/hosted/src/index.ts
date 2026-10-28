import { createApp, reverifyAll, type Services } from './app'
import { resolveTxt } from './dns'
import type { Blobs } from './sites'
import { d1Sql } from './sql'

function r2Blobs(bucket: R2Bucket): Blobs {
	return {
		async get(key) {
			const object = await bucket.get(key)
			if (object === null) return null
			return { body: object.body, etag: object.httpEtag, uploaded: object.uploaded, size: object.size }
		},
		async text(key) {
			const object = await bucket.get(key)
			return object === null ? null : object.text()
		},
		async put(key, body, contentType) {
			await bucket.put(key, body, { httpMetadata: { contentType } })
		},
		async delete(keys) {
			if (keys.length > 0) await bucket.delete(keys)
		},
		async slugs() {
			const slugs: string[] = []
			let cursor: string | undefined
			do {
				const page = await bucket.list({ prefix: 'sites/', delimiter: '/', ...(cursor === undefined ? {} : { cursor }) })
				for (const prefix of page.delimitedPrefixes) slugs.push(prefix.slice('sites/'.length, -1))
				cursor = page.truncated ? page.cursor : undefined
			} while (cursor !== undefined)
			return slugs
		},
	}
}

export function productionServices(env: Env): Services {
	return {
		blobs: r2Blobs(env.SITES),
		accounts: d1Sql(env.ACCOUNTS),
		resolveTxt: (name) => resolveTxt(env.DOH_ENDPOINT, name),
		async ping(domains) {
			const response = await fetch(env.PING_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ domains }),
			})
			if (response.status !== 202) throw new Error(`ping answered ${response.status}`)
		},
		now: () => new Date(),
		zone: env.HOSTING_ZONE,
		operatorHost: env.OPERATOR_HOST,
		operatorToken: env.OPERATOR_TOKEN,
	}
}

const app = createApp(productionServices)

export default {
	fetch: app.fetch,

	async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
		await reverifyAll(productionServices(env))
	},
} satisfies ExportedHandler<Env>

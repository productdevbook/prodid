import { createApp } from './app'
import { consumeCrawl, runScheduled } from './consumer'
import { type CrawlMessage, productionServices } from './services'

export { RateLimiter } from './limits/durable'

const app = createApp(productionServices)

export default {
	fetch: app.fetch,

	async queue(batch: MessageBatch<CrawlMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
		const services = productionServices(env)
		try {
			for (const message of batch.messages) {
				try {
					await consumeCrawl(services, message.body)
					message.ack()
				} catch (error) {
					console.error('crawl failed', message.body.domain, error)
					message.retry()
				}
			}
		} finally {
			ctx.waitUntil(services.close?.() ?? Promise.resolve())
		}
	},

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		const services = productionServices(env)
		try {
			await runScheduled(services)
		} finally {
			ctx.waitUntil(services.close?.() ?? Promise.resolve())
		}
	},
} satisfies ExportedHandler<Env, CrawlMessage>

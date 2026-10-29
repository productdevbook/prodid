import { createApp } from './app'
import { consumeBatch, type QueueBody, runScheduled } from './consumer'
import { productionServices } from './services'

export { RateLimiter } from './limits/durable'

const app = createApp(productionServices)

export default {
	fetch: app.fetch,

	async queue(batch: MessageBatch<QueueBody>, env: Env, ctx: ExecutionContext): Promise<void> {
		const services = productionServices(env)
		try {
			await consumeBatch(services, batch.queue, batch.messages)
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
} satisfies ExportedHandler<Env, QueueBody>

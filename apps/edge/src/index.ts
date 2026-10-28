import { createApp } from './app'
import { consumeCrawl, consumeDeadLetter, consumeMedia, consumeMediaDeadLetter, runScheduled } from './consumer'
import { type CrawlDeadLetter, type CrawlMessage, type MediaDeadLetter, type MediaMessage, productionServices } from './services'

export { RateLimiter } from './limits/durable'

const app = createApp(productionServices)

type QueueBody = CrawlMessage | MediaMessage | MediaDeadLetter | CrawlDeadLetter

export default {
	fetch: app.fetch,

	async queue(batch: MessageBatch<QueueBody>, env: Env, ctx: ExecutionContext): Promise<void> {
		const services = productionServices(env)
		try {
			for (const message of batch.messages) {
				try {
					await dispatch(services, batch.queue, message.body)
					message.ack()
				} catch (error) {
					console.error('queue message failed', batch.queue, error)
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
} satisfies ExportedHandler<Env, QueueBody>

function dispatch(services: ReturnType<typeof productionServices>, queue: string, body: QueueBody): Promise<void> {
	if (queue === 'prodid-media-ingest') return consumeMedia(services, body as MediaMessage)
	if (queue === 'prodid-media-dlq') return consumeMediaDeadLetter(body as MediaDeadLetter | MediaMessage)
	if (queue === 'prodid-crawl-dlq') {
		consumeDeadLetter(body as CrawlDeadLetter | CrawlMessage)
		return Promise.resolve()
	}
	return consumeCrawl(services, body as CrawlMessage).then(() => undefined)
}

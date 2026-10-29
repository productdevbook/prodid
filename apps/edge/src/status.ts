import { DAY_MS, lastDeadLetter, recordDeadLetter } from '@prodid/store'

import type { CrawlDeadLetter, CrawlMessage, MediaDeadLetter, MediaMessage, NotifyMessage, Services } from './services'

declare global {
	interface Env {
		/** The push address of the owner's "Dead letters" status component; unset, nothing is sent. */
		YUVA_STATUS_DEAD_LETTERS_URL?: string
	}
}

export const DEAD_LETTER_QUEUES: readonly string[] = ['prodid-crawl-dlq', 'prodid-media-dlq', 'prodid-notify-dlq']

export type StatusState = 'operational' | 'degraded'

/** One state change of the owner's status component, or a throw. */
export interface StatusPush {
	push(state: StatusState, message: string): Promise<void>
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

export const STATUS_MESSAGE_MAX = 1000
export const STATUS_TIMEOUT_MS = 10_000
export const QUIET_MESSAGE = 'No dead letter in the last 24 hours.'

export function yuvaStatus(url: string | undefined, fetcher: Fetch): StatusPush | null {
	if (url === undefined || url === '') return null
	return {
		async push(state, message) {
			let response: Response
			try {
				response = await fetcher(url, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ state, message: clip(message) }),
					signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
				})
			} catch (error) {
				// The address is a secret and must not reach the log through the runtime's error text.
				throw new Error((error instanceof Error ? error.message : String(error)).replaceAll(url, '<status url>'))
			}
			await response.body?.cancel()
			if (!response.ok) throw new Error(`status page answered ${response.status}`)
		},
	}
}

/**
 * Names the queue, the size of the batch and what the first letter was about: a domain, a source's
 * zone or a source id, and our own reason. Never a URL a publisher gave, never a contact.
 */
export function deadLetterMessage(queue: string, bodies: readonly unknown[]): string {
	const count = bodies.length === 1 ? '1 dead letter' : `${bodies.length} dead letters`
	return clip(`${count} on ${queue}. First: ${firstLetter(queue, bodies[0])}.`)
}

function firstLetter(queue: string, body: unknown): string {
	if (queue === 'prodid-crawl-dlq') {
		const value = body as CrawlDeadLetter | CrawlMessage
		const letter: CrawlDeadLetter = 'reason' in value ? value : { reason: 'failed on every retry of prodid-crawl', message: value }
		const message = letter.message
		const domain = (message?.kind === 'discover' ? message.domain : message?.plan?.domain) ?? 'unknown domain'
		return `${domain} (${message?.kind ?? 'unknown step'}), ${letter.reason}`
	}
	if (queue === 'prodid-media-dlq') {
		const value = body as MediaDeadLetter | MediaMessage
		const letter: MediaDeadLetter = 'reason' in value ? value : { reason: 'failed on every retry of prodid-media-ingest', message: value }
		return `media of ${letter.message?.zone ?? 'an unknown source'}, ${letter.reason}`
	}
	const notice = body as NotifyMessage
	return `lapse notice of source ${notice?.source ?? 'unknown'}, failed on every retry of prodid-notify`
}

/** Runs after the batch's own work; whatever fails here is logged and leaves the batch as it was. */
export async function reportDeadLetters(services: Services, queue: string, bodies: readonly unknown[]): Promise<void> {
	if (bodies.length === 0) return
	const message = deadLetterMessage(queue, bodies)
	try {
		await recordDeadLetter(services.sql, { queue, at: services.now(), message })
	} catch (error) {
		console.error('dead letter not recorded', queue, error)
	}
	await pushStatus(services, 'degraded', message)
}

/**
 * Once a day has passed without a dead letter the component goes back to operational, on every cron
 * run while it stays quiet. A letter recorded while that push was in flight is pushed again after
 * it, so the recovery never lands on top of it.
 */
export async function recoverStatus(services: Services): Promise<void> {
	if (services.status === null) return
	const before = await lastDeadLetter(services.sql)
	if (before !== null && services.now().getTime() - before.at.getTime() < DAY_MS) return
	if (!(await pushStatus(services, 'operational', QUIET_MESSAGE))) return
	const after = await lastDeadLetter(services.sql)
	if (after !== null && after.at.getTime() > (before?.at.getTime() ?? Number.NEGATIVE_INFINITY)) {
		await pushStatus(services, 'degraded', after.message)
	}
}

async function pushStatus(services: Services, state: StatusState, message: string): Promise<boolean> {
	if (services.status === null) return false
	try {
		await services.status.push(state, message)
		return true
	} catch (error) {
		console.error('status push failed', state, error instanceof Error ? error.message : String(error))
		return false
	}
}

function clip(text: string): string {
	const points = Array.from(text)
	return points.length <= STATUS_MESSAGE_MAX ? text : points.slice(0, STATUS_MESSAGE_MAX).join('')
}

import { claimLapseNotice, type LapseNotice, releaseLapseNotice, WITHDRAW_AFTER_LAPSE_MS } from '@prodid/store'

import type { Mail, NotifyMessage, Services } from './services'

const STATUS_PAGE = 'https://prodid.org/source/'
const PING = 'https://prodid.org/ping'
const ISSUES = 'https://github.com/productdevbook/prodid/issues/new/choose'

const MEANING = {
	'definite-negative':
		'discovery ended with no acceptable document: no prodid record, a record that could not be used, or a document that was refused.',
	'transport-failure':
		'for seven days no crawl could be completed, on the document or on a feed it lists: DNS, connection or TLS failure, 429, 5xx, a cap or a timeout.',
} as const

/** Every place that starts a lapse hands what it started here; nothing else enqueues a notice. */
export async function enqueueNotices(services: Services, notices: readonly (LapseNotice | null)[]): Promise<void> {
	const due = notices.filter((notice) => notice !== null)
	if (due.length === 0) return
	await services.notify.sendBatch(due.map((notice) => ({ source: notice.source, lapsed_at: notice.lapsedAt.toISOString() })))
}

/**
 * One notice per lapse. The claim is taken before the mail goes out and given back if it cannot be
 * sent, so a retry sends it and a second delivery of a message that was sent does not.
 */
export async function consumeNotify(services: Services, message: NotifyMessage): Promise<'sent' | 'skipped'> {
	const lapsedAt = new Date(message.lapsed_at)
	if (Number.isNaN(lapsedAt.getTime())) return 'skipped'
	const notice: LapseNotice = { source: message.source, lapsedAt }
	const claimed = await claimLapseNotice(services.sql, notice)
	if (claimed === null) return 'skipped'
	try {
		await services.mail.send(lapseMail(claimed.name, claimed.contact, claimed.outcome, lapsedAt))
	} catch (error) {
		await releaseLapseNotice(services.sql, notice, claimed.previous)
		throw error
	}
	return 'sent'
}

/** Says no more than `/source/{name}` does: no error text, no status code, no other host. */
export function lapseMail(name: string, to: string, outcome: keyof typeof MEANING, lapsedAt: Date): Mail {
	const withdrawal = new Date(lapsedAt.getTime() + WITHDRAW_AFTER_LAPSE_MS)
	const text = [
		`${name} has been lapsed since ${lapsedAt.toISOString()}.`,
		'',
		`The crawl that lapsed it ended in ${outcome}: ${MEANING[outcome]}`,
		'',
		`If nothing changes, its records and their active claims will be withdrawn on ${withdrawal.toISOString()}. They stay readable as history.`,
		'',
		`Status: ${STATUS_PAGE}${name}`,
		'',
		`What to do: put the record, the document or the feed back, then POST ${PING} to ask for a crawl. The first crawl that succeeds in full clears the lapse.`,
		'',
		`Why you received this: this address is the publisher.contact of ${name}'s own discovery document. The index sends one notice per lapse and never publishes the address. Nobody reads replies; to report a problem, use ${ISSUES}`,
		'',
	].join('\n')
	return { to, subject: `prodid: ${name} stopped publishing`, text }
}

/** A notice that failed on every retry; the contact is not logged. */
export function consumeNotifyDeadLetter(body: NotifyMessage): void {
	console.warn(
		JSON.stringify({
			event: 'notify.dead-letter',
			reason: 'failed on every retry of prodid-notify',
			source: body?.source ?? null,
			lapsed_at: body?.lapsed_at ?? null,
		}),
	)
}

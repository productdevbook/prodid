import type { Services } from './app'
import { indexName } from './crawl'
import { siteHost } from './names'
import { deleteSite, readSite } from './sites'

export const REMIND_DAYS = 23
export const RELEASE_DAYS = 30
/** However late the reminder went out, the owner has this long after it. */
export const NOTICE_DAYS = 7

const DAY = 86_400_000

export interface UnusedOutcome {
	reminded: string[]
	released: string[]
}

/**
 * The daily pass over owned sites with no feed: one reminder from day 23, release from day 30 and
 * at least a week after the reminder. A slug the index never listed is free again at once; one it
 * did is held for nobody for 30 days, as after a deletion, so its owner cannot simply take it again.
 */
export async function releaseUnused(services: Services): Promise<UnusedOutcome> {
	const now = services.now()
	const at = now.toISOString()
	const before = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
	const rows = await services.accounts.all<{ slug: string; email: string; created_at: string; reminded_at: string | null }>(
		`select site.slug, account.email, site.created_at, site.reminded_at from site join account on account.id = site.account_id
		 where site.deleted_at is null and site.created_at <= ? order by site.created_at, site.slug`,
		before(REMIND_DAYS),
	)
	const outcome: UnusedOutcome = { reminded: [], released: [] }
	for (const row of rows) {
		const site = await readSite(services.blobs, row.slug)
		if (site === null) continue
		if (site.feeds.length > 0) {
			if (row.reminded_at !== null) await services.accounts.run('update site set reminded_at = null where slug = ?', row.slug)
			continue
		}

		if (row.reminded_at === null) {
			const taken = await services.accounts.run(
				'update site set reminded_at = ? where slug = ? and reminded_at is null and deleted_at is null',
				at,
				row.slug,
			)
			if (taken === 0) continue
			const releaseAt = new Date(Math.max(Date.parse(row.created_at) + RELEASE_DAYS * DAY, now.getTime() + NOTICE_DAYS * DAY))
			const host = siteHost(row.slug, services.zone)
			try {
				await services.mail.send(
					row.email,
					`prodid: ${host} has no feed yet`,
					reminderMail(host, `https://${services.operatorHost}/sites/${row.slug}`, releaseAt),
				)
				outcome.reminded.push(row.slug)
			} catch (error) {
				console.error('reminder mail failed', row.slug, error)
				await services.accounts.run('update site set reminded_at = null where slug = ?', row.slug)
			}
			continue
		}

		if (row.created_at > before(RELEASE_DAYS) || row.reminded_at > before(NOTICE_DAYS)) continue
		const known = (await services.indexView(indexName(site, services.zone))).state !== 'not-crawled'
		const released = known
			? await services.accounts.run(
					'update site set account_id = null, deleted_at = ? where slug = ? and deleted_at is null and created_at = ?',
					at,
					row.slug,
					row.created_at,
				)
			: await services.accounts.run('delete from site where slug = ? and deleted_at is null and created_at = ?', row.slug, row.created_at)
		if (released === 0) continue
		await deleteSite(services.blobs, site)
		outcome.released.push(row.slug)
	}
	return outcome
}

function reminderMail(host: string, link: string, releaseAt: Date): string {
	return [
		`Your prodid hosting site ${host} has no feed yet.`,
		'',
		`A site with no feed is deleted 30 days after it was created, so its name can go to someone who will use it. Upload a feed before ${releaseAt.toISOString().slice(0, 10)} to keep ${host}:`,
		'',
		link,
		'',
		'If you do not need the site, there is nothing to do.',
		'',
		'Nobody reads replies to this address. For problems: https://github.com/productdevbook/prodid/issues/new/choose',
		'',
	].join('\n')
}

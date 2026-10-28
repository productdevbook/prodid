import { isIngestibleLicence, joinTxtRecord, type MerchantDeclaration, TXT_PREFIX, txtName } from '@prodid/core'
/** @jsxImportSource hono/jsx */
import { type Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'

import { announce, type App, MAX_FEEDS, reverify, type Services } from './app'
import type { TxtLookup } from './dns'
import { checkFeed, MAX_FEED_BYTES } from './feeds'
import { convertMerchant, type DroppedValues, type SkippedRow } from './merchant'
import { checkSlug, isFeedName, siteHost } from './names'
import { claimSlug, ownedSlugs, ownsSite, SITES_PER_ACCOUNT, takeCheck, unclaimSlug } from './owners'
import { InboxPage, RefusedPage, StartPage, type StartProblem } from './pages'
import {
	clearedSessionCookie,
	clientKey,
	consumeLink,
	endSession,
	FORM_COOKIE,
	formCookie,
	LINK_MINUTES,
	formToken,
	normalizeEmail,
	randomToken,
	requestLink,
	SESSION_COOKIE,
	sessionAccount,
	sessionCookie,
} from './signin'
import {
	type CreateProblem,
	type DomainCheck,
	type FeedRow,
	NewSitePage,
	type NewSiteValues,
	NoSitePage,
	SitePage,
	type SiteRow,
	SitesPage,
	type UploadResult,
	type UploadValues,
} from './sitepages'
import { feedKey, parseSiteInput, readSite, removeFeed, type Site, siteDocument, storeFeed, writeSite } from './sites'

const UPLOAD_DEFAULTS: UploadValues = { feed: 'items.ndjson', lang: '', markets: '', media: 'none' }
const TOO_LARGE = `A feed is at most ${MAX_FEED_BYTES / 1024 / 1024} MiB. Split a larger catalogue across feeds.`
/** Room for the multipart boundaries and the other fields around the file. */
const FORM_OVERHEAD = 65_536

/** Self-service paths on the operator host; a request to them without `Authorization` is a browser's. */
export const SELF_SERVICE = /^\/(?:signin(?:\/[^/]+)?|signout|slug-check|sites(?:\/.*)?)?$/

interface SignedIn {
	id: string
	email: string
	cookie: string
	form: string
}

export function selfService(build: (env: Env) => Services): Hono<App> {
	const app = new Hono<App>()

	app.use('*', async (c, next) => {
		c.set('services', build(c.env as Env))
		c.set('target', { kind: 'self-service' })
		c.header('cache-control', 'no-store')
		c.header('referrer-policy', 'same-origin')
		c.header('x-frame-options', 'DENY')
		await next()
	})

	app.get('/', async (c) => {
		if ((await signedIn(c)) !== null) return c.redirect('/sites', 303)
		return start(c, 200)
	})

	app.post('/signin', async (c) => {
		const form = await checkedForm(c)
		if (form === null) return refused(c)
		const services = c.get('services')
		const raw = String(form.get('email') ?? '')
		const email = normalizeEmail(raw)
		if (email === null) return start(c, 400, 'email', raw)

		const address = c.req.header('cf-connecting-ip')
		const response = form.get('cf-turnstile-response')
		if (typeof response !== 'string' || response === '' || !(await services.turnstile.verify(response, address))) {
			return start(c, 400, 'turnstile', email)
		}

		const token = await requestLink(services.accounts, email, await clientKey(address ?? 'unknown'), services.now())
		if (token === null) return start(c, 429, 'limit', email)
		try {
			await services.mail.send(email, 'prodid: your sign-in link', signInMail(`https://${services.operatorHost}/signin/${token}`))
		} catch (error) {
			console.error('sign-in mail failed', error)
			return start(c, 502, 'mail', email)
		}
		return c.html(<InboxPage email={email} />)
	})

	app.get('/signin/:token', async (c) => {
		const services = c.get('services')
		const session = await consumeLink(services.accounts, c.req.param('token'), services.now())
		if (session === null) return start(c, 410, 'expired')
		c.header('set-cookie', sessionCookie(session))
		return c.redirect('/sites', 303)
	})

	app.post('/signout', async (c) => {
		if ((await checkedForm(c)) === null) return refused(c)
		const session = getCookie(c, SESSION_COOKIE)
		if (session !== undefined) await endSession(c.get('services').accounts, session)
		c.header('set-cookie', clearedSessionCookie())
		return c.redirect('/', 303)
	})

	app.get('/slug-check', (c) => {
		const result = checkSlug(c.req.query('slug') ?? '')
		return c.json(result.ok ? { ok: true, reason: null } : { ok: false, reason: result.reason })
	})

	app.get('/sites', async (c) => {
		const account = await signedIn(c)
		if (account === null) return c.redirect('/', 303)
		const services = c.get('services')
		const sites: SiteRow[] = []
		for (const slug of await ownedSlugs(services.accounts, account.id)) {
			const site = await readSite(services.blobs, slug)
			if (site !== null) sites.push({ site, host: siteHost(slug, services.zone) })
		}
		return c.html(<SitesPage email={account.email} form={account.form} sites={sites} />)
	})

	app.get('/sites/new', async (c) => {
		const account = await signedIn(c)
		if (account === null) return c.redirect('/', 303)
		const services = c.get('services')
		const full = (await ownedSlugs(services.accounts, account.id)).length >= SITES_PER_ACCOUNT
		const values: NewSiteValues = { slug: '', name: '', contact: account.email, license: 'CC0-1.0', other: '' }
		return c.html(<NewSitePage form={account.form} zone={services.zone} values={values} full={full} />)
	})

	app.post('/sites', async (c) => {
		const account = await signedIn(c)
		const form = await checkedForm(c)
		if (account === null || form === null) return refused(c)
		const services = c.get('services')
		const values: NewSiteValues = {
			slug: field(form, 'slug'),
			name: field(form, 'name'),
			contact: field(form, 'contact'),
			license: field(form, 'license'),
			other: field(form, 'other'),
		}
		const again = (status: 400 | 409, problem: CreateProblem, detail?: string) =>
			c.html(
				<NewSitePage
					form={account.form}
					zone={services.zone}
					values={values}
					full={problem === 'limit'}
					problem={problem}
					detail={detail}
				/>,
				status,
			)

		const slug = checkSlug(values.slug)
		if (!slug.ok) return again(400, slug.reason)
		const parsed = parseSiteInput(settingsBody(values.name, values.contact, licence(values.license, values.other)), services.zone)
		if (!parsed.ok) return again(400, 'settings', parsed.detail)
		if ((await readSite(services.blobs, slug.slug)) !== null) return again(409, 'taken')

		const claim = await claimSlug(services.accounts, account.id, slug.slug, services.now())
		if (!claim.ok) return again(409, claim.reason)
		const site: Site = {
			slug: slug.slug,
			owner: account.id,
			publisher: parsed.input.publisher,
			license: parsed.input.license,
			feeds: [],
			updatedAt: services.now().toISOString(),
		}
		try {
			await writeSite(services.blobs, site)
		} catch (error) {
			await unclaimSlug(services.accounts, account.id, slug.slug)
			throw error
		}
		announce(c, site)
		return c.redirect(`/sites/${site.slug}`, 303)
	})

	app.get('/sites/:slug', async (c) => {
		const account = await signedIn(c)
		if (account === null) return c.redirect('/', 303)
		const site = await ownedSite(c, account)
		if (site === null) return noSite(c, account)
		const replace = c.req.query('feed')
		return sitePage(c, account, site, {
			values: { ...UPLOAD_DEFAULTS, feed: replace !== undefined && isFeedName(replace) ? replace : 'items.ndjson' },
		})
	})

	app.post('/sites/:slug/feeds', async (c) => {
		const declared = Number(c.req.header('content-length') ?? Number.NaN)
		const account = await signedIn(c)
		if (account === null) return refused(c)
		if (Number.isFinite(declared) && declared > MAX_FEED_BYTES + FORM_OVERHEAD) {
			const site = await ownedSite(c, account)
			if (site === null) return noSite(c, account)
			return sitePage(c, account, site, { values: UPLOAD_DEFAULTS, upload: refusedUpload(TOO_LARGE) }, 413)
		}
		const form = await checkedForm(c)
		if (form === null) return refused(c)
		const site = await ownedSite(c, account)
		if (site === null) return noSite(c, account)

		const values: UploadValues = {
			feed: field(form, 'feed'),
			lang: field(form, 'lang'),
			markets: field(form, 'markets'),
			media: field(form, 'media'),
		}
		const page = (status: 200 | 400 | 409 | 413, upload: UploadResult, shown = site) =>
			sitePage(c, account, shown, { values, upload }, status)
		const file = form.get('file')
		if (!(file instanceof File) || file.size === 0) return page(400, refusedUpload('Choose a file to upload.'))
		if (!isFeedName(values.feed))
			return page(400, refusedUpload('The feed name must be lowercase letters, digits and hyphens ending in .ndjson.'))
		if (!site.feeds.includes(values.feed) && site.feeds.length >= MAX_FEEDS)
			return page(409, refusedUpload(`A site lists at most ${MAX_FEEDS} feeds.`))
		if (file.size > MAX_FEED_BYTES) return page(413, refusedUpload(TOO_LARGE))

		const kind = uploadKind(file.name)
		if (kind === null) return page(400, refusedUpload('Upload a Merchant file ending in .csv or .tsv, or a feed ending in .ndjson.'))
		let bytes: Uint8Array<ArrayBuffer>
		let skipped: SkippedRow[] = []
		let dropped: DroppedValues[] = []
		if (kind === 'merchant') {
			const declaration = merchantDeclaration(values)
			if (!declaration.ok) return page(400, refusedUpload(declaration.error))
			const conversion = await convertMerchant(file.stream(), declaration.declared)
			skipped = conversion.skipped
			dropped = conversion.dropped
			if (conversion.items === 0) return page(400, { ...refusedUpload('No row could be converted.'), skipped })
			bytes = new TextEncoder().encode(conversion.ndjson)
			if (bytes.byteLength > MAX_FEED_BYTES) return page(413, { ...refusedUpload(TOO_LARGE), skipped })
		} else {
			bytes = new Uint8Array(await file.arrayBuffer())
		}

		const checked = await checkFeed(bytes)
		if (!checked.ok) {
			const error = kind === 'merchant' ? 'The converted feed was refused.' : 'The feed was refused.'
			return page(400, { ok: false, error, problems: checked.problems, skipped })
		}
		const services = c.get('services')
		const updated = await storeFeed(services.blobs, site, values.feed, bytes, checked.items, services.now())
		announce(c, updated)
		return page(200, { ok: true, feed: values.feed, items: checked.items, skipped, dropped }, updated)
	})

	app.post('/sites/:slug/feeds/:name/delete', async (c) => {
		const account = await signedIn(c)
		const form = await checkedForm(c)
		if (account === null || form === null) return refused(c)
		const site = await ownedSite(c, account)
		const name = c.req.param('name')
		if (site === null || !site.feeds.includes(name)) return noSite(c, account)
		const services = c.get('services')
		announce(c, await removeFeed(services.blobs, site, name, services.now()))
		return c.redirect(`/sites/${site.slug}#feeds`, 303)
	})

	app.post('/sites/:slug/domain', async (c) => {
		const account = await signedIn(c)
		const form = await checkedForm(c)
		if (account === null || form === null) return refused(c)
		const site = await ownedSite(c, account)
		if (site === null) return noSite(c, account)
		const services = c.get('services')

		if (field(form, 'action') === 'remove') {
			const { domain: _domain, verified: _verified, verifiedAt: _verifiedAt, ...rest } = site
			await writeSite(services.blobs, { ...rest, updatedAt: services.now().toISOString() })
			announce(c, site)
			return c.redirect(`/sites/${site.slug}#domain`, 303)
		}

		const written = field(form, 'domain')
		const parsed = parseSiteInput({ publisher: site.publisher, license: site.license, domain: written }, services.zone)
		if (!parsed.ok || parsed.input.domain === undefined) {
			const domainError = parsed.ok ? 'Enter a domain name.' : domainProblem(parsed.detail)
			return sitePage(c, account, site, { values: UPLOAD_DEFAULTS, domainError, domainValue: written }, 400)
		}
		const domain = parsed.input.domain
		const { verified: _verified, verifiedAt: _verifiedAt, ...rest } = site
		const updated: Site = site.verified === domain ? { ...site, domain } : { ...rest, domain }
		await writeSite(services.blobs, { ...updated, updatedAt: services.now().toISOString() })
		announce(c, updated)
		return c.redirect(`/sites/${site.slug}#domain`, 303)
	})

	app.post('/sites/:slug/verify', async (c) => {
		const account = await signedIn(c)
		const form = await checkedForm(c)
		if (account === null || form === null) return refused(c)
		const site = await ownedSite(c, account)
		if (site === null) return noSite(c, account)
		const services = c.get('services')
		if (site.domain === undefined) return c.redirect(`/sites/${site.slug}#domain`, 303)

		const wait = await takeCheck(services.accounts, site.slug, services.now())
		if (wait > 0) return sitePage(c, account, site, { values: UPLOAD_DEFAULTS, check: { ran: false, wait } }, 429)
		const name = txtName(site.domain) ?? `${TXT_PREFIX}${site.domain}`
		let answer: TxtLookup | undefined
		const { site: checked, outcome } = await reverify(services, site, async (lookup) => {
			answer = await services.resolveTxt(lookup)
			return answer
		})
		if (checked !== site) announce(c, checked)
		const records = answer?.ok === true ? answer.records.map(joinTxtRecord) : null
		return sitePage(c, account, checked, { values: UPLOAD_DEFAULTS, check: { ran: true, outcome, name, records } })
	})

	app.all('*', async (c) => {
		const account = await signedIn(c)
		if (account === null) return c.redirect('/', 303)
		return noSite(c, account)
	})

	return app
}

async function signedIn(c: Context<App>): Promise<SignedIn | null> {
	const cookie = getCookie(c, SESSION_COOKIE)
	if (cookie === undefined) return null
	const services = c.get('services')
	const account = await sessionAccount(services.accounts, cookie, services.now())
	return account === null ? null : { id: account.id, email: account.email, cookie, form: await formToken(cookie) }
}

/** Another account's site and no site at all answer the same, so a slug's owner is nobody else's business. */
async function ownedSite(c: Context<App>, account: SignedIn): Promise<Site | null> {
	const slug = c.req.param('slug') ?? ''
	if (!checkSlug(slug).ok) return null
	const services = c.get('services')
	if (!(await ownsSite(services.accounts, account.id, slug))) return null
	return readSite(services.blobs, slug)
}

function noSite(c: Context<App>, account: SignedIn): Response | Promise<Response> {
	return c.html(<NoSitePage form={account.form} />, 404)
}

async function sitePage(
	c: Context<App>,
	account: SignedIn,
	site: Site,
	extras: { values: UploadValues; upload?: UploadResult; check?: DomainCheck; domainError?: string; domainValue?: string },
	status: 200 | 400 | 409 | 413 | 429 = 200,
): Promise<Response> {
	const services = c.get('services')
	const feeds: FeedRow[] = await Promise.all(
		site.feeds.map(async (name) => {
			const head = await services.blobs.head(feedKey(site.slug, name))
			const items = Number(head?.metadata.items ?? Number.NaN)
			return { name, items: Number.isInteger(items) ? items : undefined, size: head?.size, uploaded: head?.uploaded }
		}),
	)
	return c.html(
		<SitePage
			form={account.form}
			site={site}
			host={siteHost(site.slug, services.zone)}
			served={siteDocument(site, services.zone) !== null}
			feeds={feeds}
			values={extras.values}
			upload={extras.upload}
			check={extras.check}
			domainError={extras.domainError}
			domainValue={extras.domainValue}
		/>,
		status,
	)
}

function domainProblem(detail: string): string {
	if (detail === 'domain is inside the hosting zone') return 'A name under the hosting zone is already this site; use a domain of your own.'
	if (detail === 'domain is not a domain name') return 'Enter a domain name such as example.com, without https:// or a path.'
	return detail
}

function refusedUpload(error: string): UploadResult {
	return { ok: false, error, problems: [], skipped: [] }
}

function uploadKind(name: string): 'merchant' | 'ndjson' | null {
	const lower = name.toLowerCase()
	if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'merchant'
	if (lower.endsWith('.ndjson')) return 'ndjson'
	return null
}

function merchantDeclaration(values: UploadValues): { ok: true; declared: MerchantDeclaration } | { ok: false; error: string } {
	const declared: MerchantDeclaration = {}
	if (values.lang !== '') declared.lang = values.lang
	const markets = values.markets
		.split(/[\s,]+/)
		.filter((market) => market !== '')
		.map((market) => market.toUpperCase())
	const wrong = markets.find((market) => !/^[A-Z]{2}$/.test(market))
	if (wrong !== undefined) return { ok: false, error: `${wrong} is not an ISO 3166-1 alpha-2 country code.` }
	if (markets.length > 0) declared.markets = [...new Set(markets)]
	if (values.media !== 'none') {
		if (!isIngestibleLicence(values.media)) return { ok: false, error: 'Choose a media licence from the list, or no media.' }
		declared.license = values.media
	}
	return { ok: true, declared }
}

function field(form: FormData, name: string): string {
	const value = form.get(name)
	return typeof value === 'string' ? value.trim() : ''
}

function licence(choice: string, other: string): string {
	return choice === 'other' ? other : choice
}

function settingsBody(name: string, contact: string, license: string): unknown {
	return { publisher: contact === '' ? { name } : { name, contact }, license }
}

/**
 * The form token is derived from the session cookie when there is one, otherwise from a cookie of
 * its own set with the form, so a page on another site can neither read nor guess it.
 */
async function start(c: Context<App>, status: 200 | 400 | 410 | 429 | 502, problem?: StartProblem, email?: string): Promise<Response> {
	let cookie = getCookie(c, SESSION_COOKIE) ?? getCookie(c, FORM_COOKIE)
	if (cookie === undefined) {
		cookie = randomToken()
		c.header('set-cookie', formCookie(cookie), { append: true })
	}
	const services = c.get('services')
	return c.html(<StartPage siteKey={services.turnstile.siteKey} form={await formToken(cookie)} problem={problem} email={email} />, status)
}

async function checkedForm(c: Context<App>): Promise<FormData | null> {
	if (c.req.header('origin') !== `https://${c.get('services').operatorHost}`) return null
	const cookie = getCookie(c, SESSION_COOKIE) ?? getCookie(c, FORM_COOKIE)
	if (cookie === undefined) return null
	let form: FormData
	try {
		form = await c.req.formData()
	} catch {
		return null
	}
	return form.get('form') === (await formToken(cookie)) ? form : null
}

function refused(c: Context<App>): Response | Promise<Response> {
	return c.html(<RefusedPage />, 403)
}

function signInMail(link: string): string {
	return [
		'Open this link to sign in to prodid hosting:',
		'',
		link,
		'',
		`It works once and expires in ${LINK_MINUTES} minutes. If you did not ask for it, ignore this mail: nothing happens without the link.`,
		'',
		'Nobody reads replies to this address. For problems: https://github.com/productdevbook/prodid/issues/new/choose',
		'',
	].join('\n')
}

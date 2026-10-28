/** @jsxImportSource hono/jsx */
import { type Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'

import { announce, type App, type Services } from './app'
import { checkSlug, siteHost } from './names'
import { claimSlug, ownedSlugs, ownsSite, SITES_PER_ACCOUNT, unclaimSlug } from './owners'
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
import { type CreateProblem, NewSitePage, type NewSiteValues, NoSitePage, SitePage, type SiteRow, SitesPage } from './sitepages'
import { parseSiteInput, readSite, type Site, siteDocument, writeSite } from './sites'

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
		const services = c.get('services')
		return c.html(
			<SitePage
				form={account.form}
				site={site}
				host={siteHost(site.slug, services.zone)}
				served={siteDocument(site, services.zone) !== null}
			/>,
		)
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

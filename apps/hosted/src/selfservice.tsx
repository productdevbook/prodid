/** @jsxImportSource hono/jsx */
import { type Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'

import type { App } from './app'
import { InboxPage, RefusedPage, SitesPage, StartPage, type StartProblem } from './pages'
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

/** Self-service paths on the operator host; a request to them without `Authorization` is a browser's. */
export const SELF_SERVICE = /^\/(?:signin(?:\/[^/]+)?|signout|sites)?$/

export function selfService(): Hono<App> {
	const app = new Hono<App>()

	for (const path of ['/', '/signin', '/signin/:token', '/signout', '/sites']) {
		app.use(path, async (c, next) => {
			if (c.get('target').kind !== 'self-service') return c.notFound()
			c.header('cache-control', 'no-store')
			c.header('referrer-policy', 'same-origin')
			c.header('x-frame-options', 'DENY')
			await next()
		})
	}

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

	app.get('/sites', async (c) => {
		const account = await signedIn(c)
		if (account === null) return c.redirect('/', 303)
		return c.html(<SitesPage email={account.email} form={await formToken(account.cookie)} />)
	})

	return app
}

async function signedIn(c: Context<App>): Promise<{ email: string; cookie: string } | null> {
	const cookie = getCookie(c, SESSION_COOKIE)
	if (cookie === undefined) return null
	const services = c.get('services')
	const account = await sessionAccount(services.accounts, cookie, services.now())
	return account === null ? null : { email: account.email, cookie }
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

/** @jsxImportSource hono/jsx */
import type { Child } from 'hono/jsx'

import { LINK_MINUTES } from './signin'

const REPORT_PUBLISHER = 'https://github.com/productdevbook/prodid/issues/new?template=report-publisher.yml'

const STYLE = `
:root {
	color-scheme: light dark;
	--bg: oklch(0.985 0.0035 85);
	--surface: oklch(1 0 0);
	--sunken: oklch(0.955 0.004 265);
	--ink: oklch(0.22 0.012 265);
	--soft: oklch(0.5 0.014 265);
	--line: oklch(0.91 0.005 265);
	--rule: oklch(0.84 0.006 265);
	--accent: oklch(0.47 0.13 252);
	--accent-bg: oklch(0.955 0.018 252);
	--ok: oklch(0.45 0.11 150);
	--ok-bg: oklch(0.955 0.03 150);
	--warn: oklch(0.5 0.13 55);
	--warn-bg: oklch(0.96 0.03 65);
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: oklch(0.165 0.008 265);
		--surface: oklch(0.205 0.009 265);
		--sunken: oklch(0.225 0.01 265);
		--ink: oklch(0.93 0.005 85);
		--soft: oklch(0.7 0.012 265);
		--line: oklch(0.28 0.01 265);
		--rule: oklch(0.36 0.012 265);
		--accent: oklch(0.79 0.1 252);
		--accent-bg: oklch(0.26 0.035 252);
		--ok: oklch(0.8 0.12 150);
		--ok-bg: oklch(0.27 0.04 150);
		--warn: oklch(0.82 0.11 65);
		--warn-bg: oklch(0.28 0.04 60);
	}
}
*, *::before, *::after { box-sizing: border-box; }
html { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-text-size-adjust: 100%; }
body { margin: 0; min-height: 100svh; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-underline-offset: 4px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }
::selection { background: var(--accent-bg); }
.shell { width: 100%; max-width: 40rem; margin: 0 auto; padding: 0 1rem; }
header { border-bottom: 1px solid var(--line); }
header .shell { display: flex; align-items: center; justify-content: space-between; gap: 1rem; height: 3.5rem; }
.wordmark { display: inline-flex; align-items: baseline; gap: 0.5rem; color: var(--ink); text-decoration: none; font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; font-weight: 600; letter-spacing: -0.025em; }
.wordmark svg { width: 0.95em; height: 0.95em; transform: translateY(0.06em); }
.wordmark small { color: var(--soft); font-weight: 400; }
main { flex: 1; padding: 2.5rem 0 3rem; }
h1 { font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 1rem; text-wrap: balance; }
h2 { font-size: 1rem; margin: 2rem 0 0.5rem; }
p { margin: 0 0 1rem; }
.soft { color: var(--soft); }
ul.needs { margin: 0 0 1rem; padding-left: 1.25rem; }
ul.needs li { margin-bottom: 0.25rem; }
form { margin: 1.5rem 0 0; padding: 0.75rem; background: var(--surface); border: 1px solid var(--line); border-radius: 0.5rem; }
@media (min-width: 30rem) { form { padding: 1.25rem; } }
label { display: block; font-weight: 500; margin-bottom: 0.375rem; }
input[type='email'] { display: block; width: 100%; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--rule); border-radius: 0.375rem; padding: 0.5rem 0.75rem; }
.turnstile { margin: 1rem 0; min-height: 65px; }
button { font: inherit; font-weight: 500; cursor: pointer; color: var(--bg); background: var(--ink); border: 1px solid var(--ink); border-radius: 0.375rem; padding: 0.5rem 1rem; }
button.quiet { color: var(--soft); background: transparent; border-color: var(--rule); }
form.inline { display: inline; margin: 0; padding: 0; background: none; border: 0; }
.note { font-size: 0.875rem; color: var(--soft); margin: 0.75rem 0 0; }
.notice { padding: 0.75rem 1rem; border-radius: 0.5rem; margin: 0 0 1.5rem; border: 1px solid var(--line); }
.notice.warn { background: var(--warn-bg); color: var(--ink); border-color: transparent; }
.notice.warn strong { color: var(--warn); }
.notice.ok { background: var(--ok-bg); border-color: transparent; }
.notice p:last-child { margin: 0; }
.address { overflow-wrap: anywhere; font-weight: 600; }
footer { border-top: 1px solid var(--line); font-size: 0.875rem; color: var(--soft); padding: 1.25rem 0; }
`

function Layout(props: { title: string; children: Child; header?: Child }) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light dark" />
				<meta name="robots" content="noindex" />
				<title>{props.title}</title>
				<style dangerouslySetInnerHTML={{ __html: STYLE }} />
			</head>
			<body>
				<header>
					<div class="shell">
						<a href="/" class="wordmark" aria-label="prodid hosting, start">
							<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
								<rect x="3" y="6" width="2.6" height="20" rx="1.3" />
								<rect x="8.6" y="9" width="1.5" height="14" rx="0.75" />
								<rect x="13.1" y="6" width="3.2" height="20" rx="1.6" />
								<circle cx="24.6" cy="16" r="4.6" />
							</svg>
							<span>
								prodid <small>hosting</small>
							</span>
						</a>
						{props.header}
					</div>
				</header>
				<main id="main">
					<div class="shell">{props.children}</div>
				</main>
				<footer>
					<div class="shell">
						<a href="https://prodid.org/publish">Publisher guide</a> · <a href={REPORT_PUBLISHER}>Report a publisher</a>
					</div>
				</footer>
			</body>
		</html>
	)
}

export type StartProblem = 'expired' | 'email' | 'turnstile' | 'limit' | 'mail'

const PROBLEMS: Record<StartProblem, { title: string; text: string }> = {
	expired: {
		title: 'This link has expired',
		text: `A sign-in link works once and for ${LINK_MINUTES} minutes. Ask for a new one below.`,
	},
	email: { title: 'That is not an email address', text: 'Check the address and send the form again.' },
	turnstile: { title: 'The check did not pass', text: 'Complete the check above the button and send the form again.' },
	limit: { title: 'Too many sign-in links', text: 'This address or network asked for too many links in the last hour. Try again later.' },
	mail: { title: 'The mail could not be sent', text: 'Nothing is wrong with your address. Try again in a few minutes.' },
}

export function StartPage(props: { siteKey: string; form: string; problem?: StartProblem | undefined; email?: string | undefined }) {
	const problem = props.problem === undefined ? undefined : PROBLEMS[props.problem]
	return (
		<Layout title="prodid hosting">
			{problem && (
				<div class="notice warn" role="alert">
					<p>
						<strong>{problem.title}</strong>
					</p>
					<p>{problem.text}</p>
				</div>
			)}
			<h1>Publish your products without a website</h1>
			<p>
				prodid hosting serves your catalogue at <code>&lt;name&gt;.prodid.org</code>, where the prodid index reads it like any other
				publisher's. You upload, the index crawls. Add your own domain later and the source becomes yours, proven by one DNS record, without
				losing anything you published.
			</p>
			<h2>You will need</h2>
			<ul class="needs">
				<li>A Google Merchant file (.csv or .tsv) or an NDJSON feed.</li>
				<li>A licence for your data, such as CC0-1.0.</li>
				<li>Optionally, a domain you control.</li>
			</ul>
			<form method="post" action="/signin">
				<input type="hidden" name="form" value={props.form} />
				<label for="email">Email</label>
				<input id="email" name="email" type="email" required autocomplete="email" inputmode="email" value={props.email ?? ''} />
				<div class="turnstile cf-turnstile" data-sitekey={props.siteKey} data-theme="auto" data-size="flexible" />
				<button type="submit">Send sign-in link</button>
				<p class="note">We mail you a link that signs you in. It works once, for {LINK_MINUTES} minutes. No password.</p>
			</form>
			<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
		</Layout>
	)
}

export function InboxPage(props: { email: string }) {
	return (
		<Layout title="Check your inbox · prodid hosting">
			<h1>Check your inbox</h1>
			<div class="notice ok">
				<p>
					We sent a sign-in link to <span class="address">{props.email}</span>.
				</p>
			</div>
			<p>Open it within {LINK_MINUTES} minutes. It works once. If nothing arrives, look in the spam folder, then ask for a new link.</p>
			<p>
				<a href="/">Use another address</a>
			</p>
		</Layout>
	)
}

export function SitesPage(props: { email: string; form: string }) {
	return (
		<Layout
			title="Your sites · prodid hosting"
			header={
				<form method="post" action="/signout" class="inline">
					<input type="hidden" name="form" value={props.form} />
					<button type="submit" class="quiet">
						Sign out
					</button>
				</form>
			}
		>
			<h1>Your sites</h1>
			<p class="soft">
				Signed in as <span class="address">{props.email}</span>.
			</p>
		</Layout>
	)
}

export function RefusedPage() {
	return (
		<Layout title="Refused · prodid hosting">
			<h1>This form was refused</h1>
			<p>It was sent from another site or from an old copy of the page. Open the page again and send it from there.</p>
			<p>
				<a href="/">Back to the start</a>
			</p>
		</Layout>
	)
}

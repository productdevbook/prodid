/** @jsxImportSource hono/jsx */
import type { SlugRejection } from './names'
import { HOLD_DAYS, SITES_PER_ACCOUNT } from './owners'
import { Layout, SignOut } from './pages'
import type { Site } from './sites'

export const LICENCES = ['CC0-1.0', 'CC-BY-4.0'] as const

export type CreateProblem = SlugRejection | 'taken' | 'held' | 'limit' | 'settings'

export const SLUG_REASONS: Record<SlugRejection | 'taken' | 'held', string> = {
	grammar: 'Use 3 to 32 lowercase letters, digits and hyphens, starting and ending with a letter or a digit.',
	'reserved-ldh': 'A hyphen in both the third and the fourth place is reserved for internationalised names.',
	reserved: 'This name is reserved: it reads as ours, as infrastructure, or contains prodid.',
	taken: 'This name is already in use.',
	held: `This name belonged to a site deleted less than ${HOLD_DAYS} days ago and is held until the index has let it go.`,
}

export interface SiteRow {
	site: Site
	host: string
}

export function domainState(site: Site): 'none' | 'waiting' | 'verified' {
	if (site.domain === undefined) return 'none'
	return site.verified === site.domain ? 'verified' : 'waiting'
}

function DomainBadge(props: { site: Site }) {
	const state = domainState(props.site)
	if (state === 'none') return <span class="badge">none</span>
	if (state === 'waiting') return <span class="badge warn">waiting for DNS</span>
	return <span class="badge ok">verified</span>
}

export function SitesPage(props: { email: string; form: string; sites: SiteRow[] }) {
	const full = props.sites.length >= SITES_PER_ACCOUNT
	return (
		<Layout title="Your sites · prodid hosting" header={<SignOut form={props.form} />}>
			<h1>Your sites</h1>
			<p class="soft">
				Signed in as <span class="address">{props.email}</span>.
			</p>
			{props.sites.length === 0 ? (
				<p>
					You have no sites yet. A site serves your catalogue at <code>&lt;name&gt;.prodid.org</code> for the index to read.
				</p>
			) : (
				<ul class="sites">
					{props.sites.map(({ site, host }) => (
						<li>
							<a href={`/sites/${site.slug}`}>{host}</a>
							<dl class="facts">
								<dt>Domain</dt>
								<dd>
									{site.domain === undefined ? '' : `${site.domain} `}
									<DomainBadge site={site} />
								</dd>
								<dt>Feeds</dt>
								<dd>{site.feeds.length}</dd>
							</dl>
						</li>
					))}
				</ul>
			)}
			{full ? (
				<p class="note">You have {SITES_PER_ACCOUNT} sites, the most one account can hold.</p>
			) : (
				<p>
					<a class="button" href="/sites/new">
						New site
					</a>
				</p>
			)}
		</Layout>
	)
}

export interface NewSiteValues {
	slug: string
	name: string
	contact: string
	license: string
	other: string
}

const SLUG_SCRIPT = `
const input = document.getElementById('slug')
const state = document.getElementById('slug-state')
const reasons = JSON.parse(state.dataset.reasons)
let timer
input.addEventListener('input', () => {
	clearTimeout(timer)
	timer = setTimeout(async () => {
		const slug = input.value
		if (slug === '') { state.textContent = ''; state.className = 'state'; return }
		try {
			const answer = await (await fetch('/slug-check?slug=' + encodeURIComponent(slug))).json()
			if (input.value !== slug) return
			state.textContent = answer.ok ? slug + ZONE + ' follows the rules.' : reasons[answer.reason]
			state.className = answer.ok ? 'state good' : 'state bad'
			input.setAttribute('aria-invalid', answer.ok ? 'false' : 'true')
		} catch {}
	}, 250)
})
`

export function NewSitePage(props: {
	form: string
	zone: string
	values: NewSiteValues
	full: boolean
	problem?: CreateProblem | undefined
	detail?: string | undefined
}) {
	const problem = props.problem
	const slugProblem = problem !== undefined && problem !== 'limit' && problem !== 'settings' ? SLUG_REASONS[problem] : undefined
	return (
		<Layout title="New site · prodid hosting" header={<SignOut form={props.form} />}>
			<p>
				<a href="/sites">Your sites</a>
			</p>
			<h1>New site</h1>
			{(problem === 'limit' || props.full) && (
				<div class="notice warn" role="alert">
					<p>
						<strong>You already have {SITES_PER_ACCOUNT} sites</strong>
					</p>
					<p>That is the most one account can hold. Delete one to make room.</p>
				</div>
			)}
			{slugProblem !== undefined && (
				<div class="notice warn" role="alert">
					<p>
						<strong>That name cannot be used</strong>
					</p>
					<p>{slugProblem}</p>
				</div>
			)}
			{problem === 'settings' && (
				<div class="notice warn" role="alert">
					<p>
						<strong>The publisher or the licence was refused</strong>
					</p>
					<p>{props.detail}</p>
				</div>
			)}
			{!props.full && (
				<form method="post" action="/sites">
					<input type="hidden" name="form" value={props.form} />
					<div class="field">
						<label for="slug">Name</label>
						<div class="suffixed">
							<input
								id="slug"
								name="slug"
								type="text"
								required
								autocomplete="off"
								autocapitalize="none"
								spellcheck={false}
								maxlength={32}
								value={props.values.slug}
								aria-describedby="slug-rules slug-state"
								aria-invalid={slugProblem === undefined ? undefined : 'true'}
							/>
							<span>.{props.zone}</span>
						</div>
						<p class="note" id="slug-rules">
							3 to 32 lowercase letters, digits and hyphens. It becomes the address the index reads and the name your source is shown under.
						</p>
						<p class="state" id="slug-state" aria-live="polite" data-reasons={JSON.stringify(SLUG_REASONS)} />
					</div>
					<div class="field">
						<label for="name">Publisher name</label>
						<input id="name" name="name" type="text" required value={props.values.name} />
						<p class="note">Who publishes this catalogue, as the index shows it.</p>
					</div>
					<div class="field">
						<label for="contact">Contact email</label>
						<input id="contact" name="contact" type="email" required autocomplete="email" value={props.values.contact} />
						<p class="note">Published with the catalogue. Notices about the index no longer reaching your site go here.</p>
					</div>
					<div class="field">
						<label for="license">Licence for your data</label>
						<select id="license" name="license">
							<option value="CC0-1.0" selected={props.values.license === 'CC0-1.0'}>
								CC0-1.0 (recommended)
							</option>
							<option value="CC-BY-4.0" selected={props.values.license === 'CC-BY-4.0'}>
								CC-BY-4.0
							</option>
							<option value="other" selected={props.values.license === 'other'}>
								Another SPDX licence
							</option>
						</select>
					</div>
					<div class="field">
						<label for="other">Other SPDX identifier</label>
						<input id="other" name="other" type="text" autocomplete="off" autocapitalize="none" value={props.values.other} />
						<p class="note">Only when you chose another SPDX licence above.</p>
					</div>
					<button type="submit">Create</button>
				</form>
			)}
			<script dangerouslySetInnerHTML={{ __html: SLUG_SCRIPT.replace('ZONE', JSON.stringify(`.${props.zone}`)) }} />
		</Layout>
	)
}

export function SitePage(props: { form: string; site: Site; host: string; served: boolean }) {
	const documentUrl = `https://${props.host}/.well-known/prodid.json`
	return (
		<Layout title={`${props.host} · prodid hosting`} header={<SignOut form={props.form} />}>
			<p>
				<a href="/sites">Your sites</a>
			</p>
			<h1 class="address">{props.host}</h1>
			<section>
				<h2>Status</h2>
				<dl class="facts">
					<dt>Document</dt>
					<dd>
						<a href={documentUrl}>{documentUrl}</a>
					</dd>
					<dt>Served</dt>
					<dd>{props.served ? 'yes' : 'not yet: it is served once the site has a feed'}</dd>
				</dl>
			</section>
		</Layout>
	)
}

export function NoSitePage(props: { form: string }) {
	return (
		<Layout title="No such site · prodid hosting" header={<SignOut form={props.form} />}>
			<h1>No such site</h1>
			<p>This account has no site by that name.</p>
			<p>
				<a href="/sites">Your sites</a>
			</p>
		</Layout>
	)
}

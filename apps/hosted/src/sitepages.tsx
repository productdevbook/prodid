/** @jsxImportSource hono/jsx */
import { type CrawlOutcome, INGESTIBLE_LICENCES, TXT_PREFIX, TXT_VERSION } from '@prodid/core'

import { MAX_FEEDS } from './app'
import type { IndexView } from './crawl'
import type { FeedProblem } from './feeds'
import type { DroppedValues, SkippedRow } from './merchant'
import type { SlugRejection } from './names'
import { HOLD_DAYS, SITES_PER_ACCOUNT } from './owners'
import { Layout, SignOut } from './pages'
import type { Site } from './sites'
import type { VerifyOutcome } from './verify'

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
	view: IndexView
}

export function domainState(site: Site): 'none' | 'waiting' | 'verified' {
	if (site.domain === undefined) return 'none'
	return site.verified === site.domain ? 'verified' : 'waiting'
}

const OUTCOMES: Record<CrawlOutcome, { text: string; tone: string }> = {
	success: { text: 'success', tone: 'badge ok' },
	'definite-negative': { text: 'nothing served', tone: 'badge warn' },
	'transport-failure': { text: 'could not reach', tone: 'badge warn' },
}

function CrawlBadge(props: { view: IndexView }) {
	const view = props.view
	if (view.state === 'not-crawled') return <span class="badge">not crawled yet</span>
	if (view.state === 'unavailable') return <span class="badge">index unavailable</span>
	const crawl = view.source.last_crawl
	if (crawl === undefined) return <span class="badge">not crawled yet</span>
	const outcome = OUTCOMES[crawl.outcome]
	return <span class={outcome.tone}>{outcome.text}</span>
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
					{props.sites.map(({ site, host, view }) => (
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
								<dt>Last crawl</dt>
								<dd>
									<CrawlBadge view={view} />
								</dd>
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

export interface NewSiteValues extends SettingsValues {
	slug: string
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
					<PublisherFields values={props.values} />
					<button type="submit">Create</button>
				</form>
			)}
			<script dangerouslySetInnerHTML={{ __html: SLUG_SCRIPT.replace('ZONE', JSON.stringify(`.${props.zone}`)) }} />
		</Layout>
	)
}

export interface FeedRow {
	name: string
	items: number | undefined
	size: number | undefined
	uploaded: Date | undefined
}

export type UploadResult =
	| { ok: true; feed: string; items: number; skipped: SkippedRow[]; dropped: DroppedValues[] }
	| { ok: false; error: string; problems: FeedProblem[]; skipped: SkippedRow[] }

export interface UploadValues {
	feed: string
	lang: string
	markets: string
	media: string
}

export type DomainCheck = { ran: true; outcome: VerifyOutcome; name: string; records: string[] | null } | { ran: false; wait: number }

export interface SettingsValues {
	name: string
	contact: string
	license: string
	other: string
}

export interface SiteView {
	form: string
	site: Site
	host: string
	served: boolean
	indexName: string
	view: IndexView
	settings: SettingsValues
	settingsError?: string | undefined
	feeds: FeedRow[]
	upload?: UploadResult | undefined
	values: UploadValues
	check?: DomainCheck | undefined
	domainError?: string | undefined
	domainValue?: string | undefined
}

export function SitePage(props: SiteView) {
	return (
		<Layout title={`${props.host} · prodid hosting`} header={<SignOut form={props.form} />}>
			<p>
				<a href="/sites">Your sites</a>
			</p>
			<h1 class="address">{props.host}</h1>
			<Status {...props} />
			<Feeds {...props} />
			<Upload {...props} />
			<Domain {...props} />
			<Settings {...props} />
		</Layout>
	)
}

function Status(props: SiteView) {
	const documentUrl = `https://${props.host}/.well-known/prodid.json`
	const statusUrl = `https://prodid.org/source/${props.indexName}`
	const view = props.view
	const crawl = view.state === 'crawled' ? view.source.last_crawl : undefined
	return (
		<section id="status">
			<h2>Status</h2>
			<dl class="facts">
				<dt>Document</dt>
				<dd>
					<a href={documentUrl}>{documentUrl}</a>
				</dd>
				<dt>Served</dt>
				<dd>{props.served ? 'yes' : 'not yet: it is served once the site has a feed'}</dd>
				<dt>Index name</dt>
				<dd class="mono">{props.indexName}</dd>
			</dl>
			<h3>What the index sees</h3>
			{view.state === 'not-crawled' && (
				<p class="soft">
					Not crawled yet. The index lists a name from its first successful crawl;{' '}
					{props.served ? 'a crawl was asked for when you uploaded.' : 'upload a feed to ask for one.'}
				</p>
			)}
			{view.state === 'unavailable' && <p class="soft">The index could not be asked just now. Reload the page in a minute.</p>}
			{view.state === 'crawled' && (
				<dl class="facts">
					<dt>Trust</dt>
					<dd>{view.source.trust}</dd>
					<dt>Lapsed</dt>
					<dd>
						{view.source.lapsed ? (
							<span class="badge warn">
								{view.source.lapsed_at === undefined ? 'lapsed' : `since ${when(new Date(view.source.lapsed_at))}`}
							</span>
						) : (
							'no'
						)}
					</dd>
					<dt>Last crawl</dt>
					<dd>
						<CrawlBadge view={view} />
						{crawl !== undefined && ` ${when(new Date(crawl.at))}`}
					</dd>
					{crawl !== undefined && (
						<>
							<dt>Lines skipped</dt>
							<dd>{crawl.lines_skipped ?? 0}</dd>
							<dt>Feeds failed</dt>
							<dd>{crawl.feeds_failed ?? 0}</dd>
							<dt>Media failed</dt>
							<dd>{crawl.media_failed ?? 0}</dd>
						</>
					)}
				</dl>
			)}
			{view.state === 'crawled' && (
				<p class="note">
					<a href={statusUrl}>The index's status page</a>
				</p>
			)}
		</section>
	)
}

function Settings(props: SiteView) {
	const values = props.settings
	return (
		<section id="settings">
			<h2>Settings</h2>
			{props.settingsError !== undefined && (
				<div class="notice warn" role="alert">
					<p>
						<strong>The settings were refused.</strong> {props.settingsError}
					</p>
				</div>
			)}
			<form method="post" action={`/sites/${props.site.slug}/settings`}>
				<input type="hidden" name="form" value={props.form} />
				<PublisherFields values={values} />
				<button type="submit">Save settings</button>
			</form>
		</section>
	)
}

function PublisherFields(props: { values: SettingsValues }) {
	const values = props.values
	return (
		<>
			<div class="field">
				<label for="name">Publisher name</label>
				<input id="name" name="name" type="text" required value={values.name} />
				<p class="note">Who publishes this catalogue, as the index shows it.</p>
			</div>
			<div class="field">
				<label for="contact">Contact email</label>
				<input id="contact" name="contact" type="email" required autocomplete="email" value={values.contact} />
				<p class="note">Published with the catalogue. Notices about the index no longer reaching your site go here.</p>
			</div>
			<div class="field">
				<label for="license">Licence for your data</label>
				<select id="license" name="license">
					<option value="CC0-1.0" selected={values.license === 'CC0-1.0'}>
						CC0-1.0 (recommended)
					</option>
					<option value="CC-BY-4.0" selected={values.license === 'CC-BY-4.0'}>
						CC-BY-4.0
					</option>
					<option value="other" selected={values.license === 'other'}>
						Another SPDX licence
					</option>
				</select>
			</div>
			<div class="field">
				<label for="other">Other SPDX identifier</label>
				<input id="other" name="other" type="text" autocomplete="off" autocapitalize="none" value={values.other} />
				<p class="note">Only when you chose another SPDX licence above.</p>
			</div>
		</>
	)
}

function Feeds(props: SiteView) {
	return (
		<section id="feeds">
			<h2>Feeds</h2>
			{props.feeds.length === 0 ? (
				<p class="soft">No feed yet. Upload one below; the document is served from the first.</p>
			) : (
				<ul class="sites">
					{props.feeds.map((feed) => (
						<li>
							<a href={`https://${props.host}/feeds/${feed.name}`} class="mono">
								{feed.name}
							</a>
							<dl class="facts">
								<dt>Items</dt>
								<dd>{feed.items ?? 'unknown'}</dd>
								<dt>Size</dt>
								<dd>{feed.size === undefined ? 'unknown' : bytes(feed.size)}</dd>
								<dt>Uploaded</dt>
								<dd>{feed.uploaded === undefined ? 'unknown' : when(feed.uploaded)}</dd>
							</dl>
							<div class="actions">
								<a href={`/sites/${props.site.slug}?feed=${feed.name}#upload`}>Replace</a>
								<form method="post" action={`/sites/${props.site.slug}/feeds/${feed.name}/delete`} class="inline">
									<input type="hidden" name="form" value={props.form} />
									<button type="submit" class="quiet">
										Delete
									</button>
								</form>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}

function UploadOutcome(props: { result: UploadResult }) {
	const result = props.result
	return (
		<div class={result.ok ? 'notice ok' : 'notice warn'} role={result.ok ? 'status' : 'alert'}>
			{result.ok ? (
				<p>
					<strong>
						Stored <span class="mono">{result.feed}</span>: {result.items} {result.items === 1 ? 'item' : 'items'} written.
					</strong>
				</p>
			) : (
				<p>
					<strong>Nothing was stored.</strong> {result.error}
				</p>
			)}
			{!result.ok && result.problems.length > 0 && (
				<ul class="problems">
					{result.problems.map((problem) => (
						<li>
							{problem.line === 0 ? '' : `Line ${problem.line}: `}
							{problem.error}
						</li>
					))}
				</ul>
			)}
			{result.skipped.length > 0 && (
				<>
					<p>
						{result.skipped.length} {result.skipped.length === 1 ? 'row was' : 'rows were'} skipped:
					</p>
					<ul class="problems">
						{result.skipped.map((row) => (
							<li>
								Row {row.row}: {row.reason}
							</li>
						))}
					</ul>
				</>
			)}
			{result.ok && result.dropped.length > 0 && (
				<>
					<p>Values with no place in a record were left out:</p>
					<ul class="problems">
						{result.dropped.map((row) => (
							<li>
								Row {row.row}: {row.values.join('; ')}
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	)
}

function Upload(props: SiteView) {
	return (
		<section id="upload">
			<h2>Upload</h2>
			{props.upload !== undefined && <UploadOutcome result={props.upload} />}
			<p class="soft">
				A Google Merchant file (.csv or .tsv) is converted to prodid items here; an NDJSON feed is stored as it is. Every line is checked
				before anything is stored. Up to {MAX_FEEDS} feeds of 32 MiB each.
			</p>
			<form method="post" action={`/sites/${props.site.slug}/feeds`} enctype="multipart/form-data">
				<input type="hidden" name="form" value={props.form} />
				<div class="field">
					<label for="file">File</label>
					<input id="file" name="file" type="file" required accept=".csv,.tsv,.ndjson" />
				</div>
				<div class="field">
					<label for="feed">Feed name</label>
					<input id="feed" name="feed" type="text" required autocomplete="off" autocapitalize="none" value={props.values.feed} />
					<p class="note">Lowercase letters, digits and hyphens, ending in .ndjson. An existing name is replaced.</p>
				</div>
				<fieldset>
					<legend>For a Merchant file</legend>
					<div class="field">
						<label for="lang">Language</label>
						<input id="lang" name="lang" type="text" autocomplete="off" autocapitalize="none" value={props.values.lang} />
						<p class="note">The BCP 47 tag of the text in the file, such as en or tr.</p>
					</div>
					<div class="field">
						<label for="markets">Markets</label>
						<input id="markets" name="markets" type="text" autocomplete="off" value={props.values.markets} />
						<p class="note">ISO 3166-1 alpha-2 codes of the countries it is sold in, separated by commas: TR, DE.</p>
					</div>
					<div class="field">
						<label for="media">Media licence</label>
						<select id="media" name="media">
							<option value="none" selected={props.values.media === 'none'}>
								No media
							</option>
							{INGESTIBLE_LICENCES.map((licence) => (
								<option value={licence} selected={props.values.media === licence}>
									{licence}
								</option>
							))}
						</select>
						<p class="note">The licence your images and documents are under. With no media, image links are left out.</p>
					</div>
				</fieldset>
				<button type="submit">Upload</button>
			</form>
		</section>
	)
}

export function txtRecordLine(domain: string, host: string): string {
	return `${TXT_PREFIX}${domain}  TXT  "v=${TXT_VERSION}; host=${host}"`
}

function outcomeText(outcome: VerifyOutcome, host: string): string {
	switch (outcome.state) {
		case 'verified':
			return `Verified: ${outcome.domain} delegates to ${host}, and the document now names it.`
		case 'lookup-failed':
			return `The DNS lookup failed (${outcome.reason}). Nothing was changed; try again in a minute.`
		case 'no-domain':
			return 'This site has no domain.'
		case 'not-delegated':
			if (outcome.reason === 'no-record') return 'No prodid record yet. Add the record above, then check again.'
			if (outcome.reason.startsWith('record names ')) return `The ${outcome.reason}, not ${host}.`
			return `The record was not accepted (${outcome.reason}).`
	}
}

function CheckOutcome(props: { check: DomainCheck; host: string }) {
	const check = props.check
	if (!check.ran) {
		return (
			<div class="notice warn" role="alert">
				<p>
					<strong>Checked less than a minute ago.</strong> Try again in {check.wait} {check.wait === 1 ? 'second' : 'seconds'}.
				</p>
			</div>
		)
	}
	return (
		<div class={check.outcome.state === 'verified' ? 'notice ok' : 'notice warn'} role="status">
			<p>
				<strong>{outcomeText(check.outcome, props.host)}</strong>
			</p>
			{check.records !== null && (
				<>
					<p>
						TXT values found at <span class="mono">{check.name}</span>:{check.records.length === 0 && ' none.'}
					</p>
					{check.records.length > 0 && (
						<ul class="problems">
							{check.records.map((record) => (
								<li class="mono">{record}</li>
							))}
						</ul>
					)}
				</>
			)}
		</div>
	)
}

function Domain(props: SiteView) {
	const domain = props.site.domain
	const action = `/sites/${props.site.slug}/domain`
	return (
		<section id="domain">
			<h2>Domain</h2>
			{props.domainError !== undefined && (
				<div class="notice warn" role="alert">
					<p>
						<strong>That domain cannot be used.</strong> {props.domainError}
					</p>
				</div>
			)}
			{domain === undefined ? (
				<p class="soft">
					With your own domain the source is yours: the index lists your products under it, proven by one DNS record. Nothing you published
					here is lost.
				</p>
			) : (
				<>
					<p>
						<span class="address">{domain}</span> <DomainBadge site={props.site} />
					</p>
					<p>Add this record at your DNS provider:</p>
					<pre class="record">
						<code>{txtRecordLine(domain, props.host)}</code>
					</pre>
					{props.check !== undefined && <CheckOutcome check={props.check} host={props.host} />}
					<form method="post" action={`/sites/${props.site.slug}/verify`} class="inline">
						<input type="hidden" name="form" value={props.form} />
						<button type="submit">Check now</button>
					</form>
				</>
			)}
			<form method="post" action={action}>
				<input type="hidden" name="form" value={props.form} />
				<div class="field">
					<label for="domain-name">{domain === undefined ? 'Domain' : 'Another domain'}</label>
					<input
						id="domain-name"
						name="domain"
						type="text"
						required
						autocomplete="off"
						autocapitalize="none"
						spellcheck={false}
						placeholder="example.com"
						value={props.domainValue ?? ''}
					/>
				</div>
				<button type="submit" name="action" value="save">
					Save domain
				</button>
			</form>
			{domain !== undefined && (
				<>
					<p class="note">Removing the domain turns the site back into {props.host} alone, unverified.</p>
					<form method="post" action={action} class="inline">
						<input type="hidden" name="form" value={props.form} />
						<button type="submit" name="action" value="remove" class="quiet">
							Remove domain
						</button>
					</form>
				</>
			)}
		</section>
	)
}

function bytes(size: number): string {
	if (size < 1024) return `${size} B`
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`
	return `${(size / 1024 / 1024).toFixed(1)} MiB`
}

export function when(date: Date): string {
	return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
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

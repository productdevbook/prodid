import { type EntityRecord, type JsonValue, PROBLEM_BASE, type ProblemBody, type SourceRecord, type Trust } from '@prodid/core'
import { WITHDRAW_AFTER_LAPSE_MS } from '@prodid/store'

import {
	CATALOGUES,
	type Catalogue,
	ENGLISH,
	type Language,
	LANGUAGES,
	languageHref,
	type Locale,
	localHref,
	NATIVE_NAMES,
	primarySubtag,
	RTL,
} from './i18n'
import {
	type EntityView,
	entityView,
	type LinkView,
	type MediaView,
	type PropertyView,
	sourceStatusView,
	type SourceView,
	type ValueView,
} from './view'

const SITE = 'https://prodid.org'

interface Page {
	t: Catalogue
	locale: Locale
}

function pageOf(locale: Locale): Page {
	return { t: CATALOGUES[locale.lang], locale }
}

/**
 * The HTML half of every answer: one self-contained string per page, styled inline with the
 * website's tokens, so a page makes no request of its own beyond the media it shows.
 */
export function renderEntity(entity: EntityRecord, options: { history?: boolean; locale?: Locale } = {}): string {
	const p = pageOf(options.locale ?? ENGLISH)
	const { t } = p
	const view = inLanguage(entityView(entity), p.locale.lang)
	const history = options.history === true
	const variants = view.properties.filter((property) => property.property.startsWith('variant.'))
	const category = view.properties.filter((property) => property.property === 'category')
	const markets = view.properties.filter((property) => property.property === 'markets')
	const properties = view.properties.filter(
		(property) => !property.property.startsWith('variant.') && property.property !== 'category' && property.property !== 'markets',
	)

	const sections = [
		entityHeader(p, view, history),
		mediaSection(p, view.media),
		section(
			'facts',
			[
				view.brands.length === 0 ? '' : `${subheading(t.entity.brand)}${valueList(p, view.brands)}`,
				view.identifiers.length === 0 ? '' : identifierTable(p, view),
				category.length === 0
					? ''
					: `${subheading(t.entity.category)}${valueList(
							p,
							category.flatMap((property) => property.values),
						)}`,
				markets.length === 0
					? ''
					: `${subheading(t.entity.markets)}${valueList(
							p,
							markets.flatMap((property) => property.values),
							'inline',
						)}`,
			].join(''),
		),
		section(
			'properties',
			[
				variants.length === 0 ? '' : `${subheading(t.entity.variant)}${propertyTable(p, variants, t.entity.axis)}`,
				properties.length === 0 ? '' : `${subheading(t.entity.properties)}${propertyTable(p, properties, t.entity.property)}`,
			].join(''),
		),
		navigationSection(p, view),
		view.navigation.mergedFrom.length === 0
			? ''
			: section(
					'merged',
					`${subheading(t.entity.mergedFrom)}<p class="soft">${escape(t.entity.mergedNote)}</p>${linkList(p, view.navigation.mergedFrom)}`,
				),
	]

	const title = view.names.find((name) => name.withdrawnAt === null)?.value
	return page(p, `${typeof title === 'string' ? title : view.opid} — prodid`, sections.join(''), entityFooter(p, view, history))
}

export function renderSource(source: SourceRecord, locale: Locale = ENGLISH): string {
	const p = pageOf(locale)
	const { t } = p
	const view = sourceStatusView(source)
	const badges = `<p class="badges">${trustLabel(p, view.trust, ' badge')}${view.lapsed ? lapsedLabel(p) : ''}</p>`
	const banner =
		view.lapsed && view.lapsedAt !== null
			? `<p class="banner warn" role="note"><strong>${t.source.lapsedSince(time(view.lapsedAt, 'full'))}</strong> ${t.source.lapsedBody(
					time(new Date(Date.parse(view.lapsedAt) + WITHDRAW_AFTER_LAPSE_MS).toISOString().replace('.000Z', 'Z'), 'full'),
				)}</p>`
			: ''
	const header = section(
		'header',
		`<p class="eyebrow"><span class="kind">${escape(t.source.kind[view.kind])}</span></p><h1 class="mono">${escape(view.name)}</h1>${badges}${banner}`,
	)

	const verification = section(
		'verification',
		`${subheading(t.source.verification)}${definitions([
			[
				t.source.verifiedBy,
				view.verifiedBy === null ? `<span class="soft">${escape(t.source.notVerified)}</span>` : `<code>${escape(view.verifiedBy)}</code>`,
			],
			...(view.verifiedAt === null ? [] : [[t.source.verifiedAt, time(view.verifiedAt, 'full')] as Row]),
			[
				t.source.license,
				view.license === null ? `<span class="soft">${escape(t.source.noneStated)}</span>` : `<code>${escape(view.license)}</code>`,
			],
		])}`,
	)

	const crawl = view.lastCrawl
	const counts: [string, number | null][] =
		crawl === null
			? []
			: [
					[t.source.recordsSeen, crawl.recordsSeen],
					[t.source.recordsChanged, crawl.recordsChanged],
					[t.source.linesSkipped, crawl.linesSkipped],
					[t.source.feedsFailed, crawl.feedsFailed],
					[t.source.mediaFailed, crawl.mediaFailed],
				]
	const lastCrawl = section(
		'crawl',
		`${subheading(t.source.lastCrawl)}${
			crawl === null
				? `<p class="soft">${escape(t.source.noCrawl)}</p>`
				: definitions([
						[t.source.at, time(crawl.at, 'full')],
						[
							t.source.outcome,
							`<span class="outcome ${escape(crawl.outcome)}">${escape(crawl.outcome)}</span><span class="meaning">${escape(
								t.source.outcomes[crawl.outcome],
							)}</span>`,
						],
						...(crawl.via === null ? [] : [[t.source.via, `<code>${escape(crawl.via)}</code>`] as Row]),
						...(crawl.documentUrl === null ? [] : [[t.source.document, `<code>${escape(crawl.documentUrl)}</code>`] as Row]),
						...(crawl.httpStatus === null ? [] : [[t.source.httpStatus, `<span class="mono">${crawl.httpStatus}</span>`] as Row]),
						...counts
							.filter((entry): entry is [string, number] => entry[1] !== null)
							.map(([term, count]) => [term, `<span class="mono">${count}</span>`] as Row),
					])
		}`,
	)

	const footer = `<p class="lede">${escape(t.source.lede)}</p><ul class="rules"><li>${escape(t.source.ruleDiscovery)}</li><li>${escape(
		t.source.ruleHost,
	)}</li><li>${escape(t.source.ruleNever)}</li></ul><ul class="links"><li><a href="${SITE}/spec#a-sources-status">${escape(
		t.source.spec,
	)}</a></li><li><span class="soft">JSON</span> ${t.sameUrl('<code>Accept: application/json</code>')}</li></ul>`

	return page(p, `${view.name} — ${t.source.titleSuffix}`, header + verification + lastCrawl, footer)
}

export function renderProblem(body: ProblemBody, locale: Locale = ENGLISH): string {
	const p = pageOf(locale)
	const { t } = p
	const type = body.type.startsWith(PROBLEM_BASE) ? body.type.slice(PROBLEM_BASE.length) : null
	const titles: Readonly<Record<string, string>> = t.problem.titles
	const title = type !== null && Object.hasOwn(titles, type) ? titles[type]! : body.title
	const parts = [
		`<p class="eyebrow"><span class="kind">${escape(t.problem.error(String(body.status)))}</span></p>`,
		`<h1>${escape(title)}</h1>`,
		body.detail === undefined ? '' : `<p class="detail"><code>${escape(body.detail)}</code></p>`,
		type === 'unknown-gtin' ? `<p class="lede-line">${t.problem.unknownGtin(`<a href="${SITE}/publish">prodid.org/publish</a>`)}</p>` : '',
		type === null ? '' : `<p class="soft">${escape(t.problem.type)} <code>${escape(type)}</code></p>`,
	]
	return page(p, `${body.status} ${title} — prodid`, section('problem', parts.join('')))
}

type Row = [string, string]

function inLanguage(view: EntityView, language: Language): EntityView {
	const primary = primarySubtag(language)
	const order = (values: readonly ValueView[]): ValueView[] => {
		const matches = (value: ValueView) => value.lang !== null && primarySubtag(value.lang) === primary
		return [...values.filter(matches), ...values.filter((value) => !matches(value))]
	}
	return {
		...view,
		names: order(view.names),
		brands: order(view.brands),
		properties: view.properties.map((property) => ({ ...property, values: order(property.values) })),
	}
}

function entityHeader(p: Page, view: EntityView, history: boolean): string {
	const { t } = p
	const names =
		view.names.length === 0 ? `<h1 class="names"><span class="mono">${escape(view.opid)}</span></h1>` : nameHeading(p, view.names)
	const banner = view.hasLapsedSource ? `<p class="banner warn" role="note">${escape(t.entity.lapsedBanner)}</p>` : ''
	const historyNote = history ? `<p class="banner" role="note">${escape(t.entity.historyBanner)}</p>` : ''
	return section(
		'header',
		`<p class="eyebrow"><span class="kind">${escape(t.entity.kind[view.kind])}</span></p>${names}<p class="opid"><span class="soft">opid</span> <code class="select-all" title="${escape(
			t.entity.copy,
		)}">${escape(view.opid)}</code></p>${banner}${historyNote}`,
	)
}

function nameHeading(p: Page, names: readonly ValueView[]): string {
	const rows = names
		.map(
			(name) =>
				`<span class="name${name.withdrawnAt === null ? '' : ' withdrawn'}">${valueMarkup(name, 'name-value')}${chip(p, name)}</span>`,
		)
		.join('')
	return `<h1 class="names">${rows}</h1>`
}

function mediaSection(p: Page, media: readonly MediaView[]): string {
	if (media.length === 0) return ''
	const images = media.filter((entry) => entry.kind !== 'document')
	const documents = media.filter((entry) => entry.kind === 'document')
	const strip =
		images.length === 0
			? ''
			: `${subheading(p.t.entity.images)}<ul class="strip">${images
					.map(
						(entry) =>
							`<li${withdrawnClass(entry.withdrawnAt)}><figure><a href="${escape(entry.mediaUrl)}"><img src="${escape(
								entry.mediaUrl,
							)}" alt="" width="160" height="160" loading="lazy" decoding="async"></a><figcaption><span class="license">${escape(
								entry.license,
							)}</span>${chip(p, entry)}</figcaption></figure></li>`,
					)
					.join('')}</ul>`
	const list =
		documents.length === 0
			? ''
			: `${subheading(p.t.entity.documents)}<ul class="values">${documents
					.map(
						(entry) =>
							`<li${withdrawnClass(entry.withdrawnAt)}><a class="doc" href="${escape(entry.mediaUrl)}"><span class="tag">PDF</span>${escape(
								fileName(entry.sourceUrl),
							)}</a> <span class="license">${escape(entry.license)}</span>${chip(p, entry)}</li>`,
					)
					.join('')}</ul>`
	return section('media', strip + list)
}

function identifierTable(p: Page, view: EntityView): string {
	const { t } = p
	const rows = view.identifiers
		.map(
			(identifier) =>
				`<tr><td>${escape(identifier.scheme)}</td><td class="mono">${escape(identifier.value)}</td><td class="mono">${escape(
					identifier.scope ?? '',
				)}</td></tr>`,
		)
		.join('')
	return `${subheading(t.entity.identifiers)}<table class="data"><thead><tr><th scope="col">${escape(t.entity.scheme)}</th><th scope="col">${escape(
		t.entity.value,
	)}</th><th scope="col">${escape(t.entity.scope)}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function propertyTable(p: Page, properties: readonly PropertyView[], label: string): string {
	const rows = properties
		.map((property) =>
			property.values
				.map((value, index) => {
					const key =
						index === 0
							? `<th scope="row" rowspan="${property.values.length}">${escape(property.key ?? property.property)}${
									property.disagreement ? `<span class="disagree">${escape(p.t.entity.disagree)}</span>` : ''
								}</th>`
							: ''
					return `<tr${withdrawnClass(value.withdrawnAt)}>${key}<td>${valueMarkup(value)}${chip(p, value)}</td></tr>`
				})
				.join(''),
		)
		.join('')
	return `<table class="data pairs"><thead><tr><th scope="col">${escape(label)}</th><th scope="col">${escape(
		p.t.entity.value,
	)}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function navigationSection(p: Page, view: EntityView): string {
	const { t } = p
	const up: string[] = []
	if (view.navigation.family !== null)
		up.push(`<li><span class="soft">${escape(t.entity.family)}</span> ${opidLink(p, view.navigation.family)}</li>`)
	if (view.navigation.variant !== null)
		up.push(`<li><span class="soft">${escape(t.entity.variantOf)}</span> ${opidLink(p, view.navigation.variant)}</li>`)
	const children = view.navigation.children
	if (up.length === 0 && children.length === 0) return ''
	const down =
		children.length === 0
			? ''
			: `${subheading(view.kind === 'family' ? t.entity.variantsAndItems : t.entity.items)}${linkList(p, children)}`
	return section('family', `${up.length === 0 ? '' : `${subheading(t.entity.partOf)}<ul class="links">${up.join('')}</ul>`}${down}`)
}

function entityFooter(p: Page, view: EntityView, history: boolean): string {
	const { t } = p
	const path = `/id/${view.opid}`
	const historyLink = history
		? `<a href="${escape(localHref(p.locale, path))}">${escape(t.entity.current)}</a>`
		: `<a href="${escape(localHref(p.locale, `${path}?history=1`))}">${escape(t.entity.history)}</a>`
	return `<p class="lede">${escape(t.entity.lede)}</p><ul class="links"><li><span class="soft">JSON</span> ${t.sameUrl(
		'<code>Accept: application/json</code>',
	)}: <code class="select-all">curl -H 'Accept: application/json' ${escape(SITE + path)}</code></li><li>${historyLink}</li><li><a href="${SITE}/spec">${escape(
		t.entity.spec,
	)}</a></li></ul>`
}

function valueList(p: Page, values: readonly ValueView[], layout: 'stacked' | 'inline' = 'stacked'): string {
	const items = values.map((value) => `<li${withdrawnClass(value.withdrawnAt)}>${valueMarkup(value)}${chip(p, value)}</li>`).join('')
	return `<ul class="values${layout === 'inline' ? ' inline' : ''}">${items}</ul>`
}

function valueMarkup(value: ValueView, className = 'value'): string {
	const lang = value.lang === null ? '' : ` lang="${escape(value.lang)}"`
	const shown = `<span class="${className}"${lang} dir="auto">${escape(display(value.value))}</span>`
	return value.withdrawnAt === null ? shown : `<del>${shown}</del>`
}

function chip(p: Page, entry: { source: SourceView; seenAt: string; withdrawnAt: string | null }): string {
	const source = entry.source
	const lapsed = source.lapsed ? lapsedLabel(p) : ''
	const withdrawn = entry.withdrawnAt === null ? '' : `<span class="was">${p.t.withdrawn(time(entry.withdrawnAt))}</span>`
	return `<span class="chip"><a href="${escape(localHref(p.locale, source.href))}">${escape(source.name)}</a>${trustLabel(
		p,
		source.trust,
	)}${lapsed}${time(entry.seenAt)}${withdrawn}</span>`
}

/** The protocol word stays in the class and, when the label differs, in `title`. */
function trustLabel(p: Page, trust: Trust, extra = ''): string {
	const label = p.t.trust[trust]
	return `<span class="trust ${escape(trust)}${extra}"${label === trust ? '' : ` title="${escape(trust)}"`}>${escape(label)}</span>`
}

function lapsedLabel(p: Page): string {
	return `<span class="lapsed"${p.t.lapsed === 'lapsed' ? '' : ' title="lapsed"'}>${escape(p.t.lapsed)}</span>`
}

function time(at: string, shown: 'date' | 'full' = 'date'): string {
	return `<time datetime="${escape(at)}" title="${escape(at)}">${escape(shown === 'date' ? at.slice(0, 10) : at)}</time>`
}

function withdrawnClass(withdrawnAt: string | null): string {
	return withdrawnAt === null ? '' : ' class="withdrawn"'
}

function display(value: JsonValue): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	if (Array.isArray(value)) return value.map(display).join(', ')
	if (value !== null && typeof value === 'object' && 'value' in value && 'unit' in value && Object.keys(value).length === 2) {
		return `${display(value.value as JsonValue)} ${display(value.unit as JsonValue)}`
	}
	return JSON.stringify(value)
}

function fileName(url: string): string {
	try {
		const last = new URL(url).pathname
			.split('/')
			.filter((part) => part !== '')
			.at(-1)
		return last === undefined ? url : decodeURIComponent(last)
	} catch {
		return url
	}
}

function linkList(p: Page, entries: readonly LinkView[]): string {
	return `<ul class="links">${entries.map((entry) => `<li>${opidLink(p, entry)}</li>`).join('')}</ul>`
}

function opidLink(p: Page, entry: LinkView): string {
	return `<a class="mono" href="${escape(localHref(p.locale, entry.href))}">${escape(entry.opid)}</a>`
}

function section(name: string, body: string): string {
	return body === '' ? '' : `<section data-section="${name}">${body}</section>`
}

function definitions(rows: readonly Row[]): string {
	const body = rows.map(([term, value]) => `<dt>${escape(term)}</dt><dd>${value}</dd>`).join('')
	return `<dl>${body}</dl>`
}

function subheading(title: string): string {
	return `<h2>${escape(title)}</h2>`
}

function languageList(p: Page): string {
	const items = LANGUAGES.map(
		(language) =>
			`<li><a href="${escape(languageHref(p.locale, language))}" hreflang="${language}" lang="${language}"${
				language === p.locale.lang ? ' aria-current="true"' : ''
			}>${escape(NATIVE_NAMES[language])}</a></li>`,
	).join('')
	return `<nav class="langs" aria-label="${escape(p.t.languages)}"><ul>${items}</ul></nav>`
}

function wordmark(p: Page): string {
	return `<a class="wordmark" href="${SITE}/" aria-label="${escape(p.t.home)}"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>prodid</span></a>`
}

// The tokens and type scale of apps/web/src/styles/global.css, copied: a page here loads nothing.
const STYLE = `:root{color-scheme:light dark;--bg:oklch(0.985 0.0035 85);--surface:oklch(1 0 0);--sunken:oklch(0.955 0.004 265);--ink:oklch(0.22 0.012 265);--soft:oklch(0.5 0.014 265);--line:oklch(0.91 0.005 265);--rule:oklch(0.84 0.006 265);--accent:oklch(0.47 0.13 252);--accent-bg:oklch(0.955 0.018 252);--ok:oklch(0.45 0.11 150);--ok-bg:oklch(0.955 0.03 150);--warn:oklch(0.5 0.13 55);--warn-bg:oklch(0.96 0.03 65);--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace}
@media (prefers-color-scheme:dark){:root{--bg:oklch(0.165 0.008 265);--surface:oklch(0.205 0.009 265);--sunken:oklch(0.225 0.01 265);--ink:oklch(0.93 0.005 85);--soft:oklch(0.7 0.012 265);--line:oklch(0.28 0.01 265);--rule:oklch(0.36 0.012 265);--accent:oklch(0.79 0.1 252);--accent-bg:oklch(0.26 0.035 252);--ok:oklch(0.8 0.12 150);--ok-bg:oklch(0.27 0.04 150);--warn:oklch(0.82 0.11 65);--warn-bg:oklch(0.28 0.04 60)}}
*,*::before,*::after{box-sizing:border-box}
html{font-family:var(--sans);-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-size:1rem;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}
a{color:var(--accent);text-decoration:underline;text-decoration-thickness:from-font;text-underline-offset:0.2em}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
::selection{background:var(--accent-bg)}
h1,h2{text-wrap:balance;margin:0}
h1{font-size:1.875rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2}
h2{margin-top:2.25rem;padding-top:1.5rem;border-top:1px solid var(--line);font-size:1.125rem;font-weight:600;letter-spacing:-0.01em;line-height:1.3}
section>h2:first-child{margin-top:2.5rem}
p{margin:0.75rem 0 0}
ul{margin:0.75rem 0 0;padding:0;list-style:none}
code,.mono{font-family:var(--mono)}
code,time{direction:ltr;unicode-bidi:isolate}
code{font-size:0.875em;background:var(--sunken);border:1px solid var(--line);border-radius:4px;padding:0.1em 0.35em}
.shell{margin:0 auto;width:100%;max-width:64rem;padding:0 1rem}
@media (min-width:40rem){.shell{padding:0 2rem}}
.top{border-bottom:1px solid var(--line);background:var(--bg)}
.top .shell{display:flex;align-items:center;height:3.5rem}
.wordmark{direction:ltr;display:inline-flex;align-items:baseline;gap:0.5rem;font-family:var(--mono);font-weight:600;letter-spacing:-0.01em;font-size:0.95rem;color:var(--ink);text-decoration:none}
.wordmark:hover{color:var(--accent)}
.mark{position:relative;display:inline-block;width:0.95em;height:0.95em;flex-shrink:0;transform:translateY(0.06em)}
.mark i{position:absolute;background:currentColor;border-radius:999px;top:18.75%;height:62.5%}
.mark i:nth-child(1){left:9.4%;width:8.1%}
.mark i:nth-child(2){left:26.9%;width:4.7%;top:28.1%;height:43.75%}
.mark i:nth-child(3){left:40.9%;width:10%}
.mark i:nth-child(4){left:62.5%;top:35.6%;width:28.75%;height:28.75%}
main.shell{padding-top:2.5rem;padding-bottom:3rem}
.eyebrow{margin:0 0 0.5rem;font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--soft)}
.kind{display:inline-block;border:1px solid var(--rule);border-radius:999px;padding:0.1rem 0.6rem}
.names .name{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.25rem 0.75rem}
.names .name+.name{margin-top:0.5rem;font-size:1.375rem;font-weight:500}
.names .chip{font-size:0.75rem;font-weight:400;letter-spacing:0}
.opid{color:var(--soft);font-size:0.875rem}
.opid code{color:var(--ink);font-size:0.9375rem}
.select-all{user-select:all;-webkit-user-select:all;cursor:text}
.soft{color:var(--soft)}
.lede{margin:0;font-size:1.0625rem;font-weight:500}
.banner{margin-top:1.25rem;border:1px solid var(--line);border-radius:8px;padding:0.75rem 1rem;background:var(--surface);font-size:0.9375rem}
.banner.warn{border-color:var(--warn);background:var(--warn-bg);color:var(--ink)}
.banner strong{color:var(--warn)}
.chip{display:inline-flex;flex-wrap:wrap;align-items:center;gap:0.15rem 0.5rem;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:0.1rem 0.5rem;font-size:0.75rem;line-height:1.5;color:var(--soft);vertical-align:middle}
.chip a{font-family:var(--mono);color:var(--ink);text-decoration:none}
.chip a:hover{color:var(--accent);text-decoration:underline}
.trust{font-weight:600;text-transform:lowercase}
.trust.verified{color:var(--ok)}
.trust.authoritative{color:var(--accent)}
.lapsed,.disagree,.tag{display:inline-block;border-radius:4px;padding:0 0.35rem;font-size:0.6875rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
.lapsed,.disagree{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn)}
.disagree{display:block;width:fit-content;max-width:100%;margin-top:0.35rem}
.tag{background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent);margin-inline-end:0.5rem}
.was{color:var(--warn)}
.values li{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.25rem 0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--line)}
.values.inline{display:flex;flex-wrap:wrap;gap:0.5rem}
.values.inline li{border:1px solid var(--line);border-radius:8px;padding:0.35rem 0.6rem;gap:0.25rem 0.5rem}
.value{font-weight:500}
.withdrawn .value,.withdrawn .name-value,.withdrawn img{opacity:0.6}
del{text-decoration-thickness:1.5px}
.license{font-family:var(--mono);font-size:0.75rem;color:var(--soft)}
.strip{display:flex;gap:0.75rem;overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:0.5rem;scroll-snap-type:x proximity}
.strip li{flex:0 0 auto;width:10rem;scroll-snap-align:start}
.strip figure{margin:0}
.strip img{display:block;width:10rem;height:10rem;object-fit:contain;background:var(--sunken);border:1px solid var(--line);border-radius:8px}
.strip figcaption{display:flex;flex-direction:column;align-items:flex-start;gap:0.35rem;margin-top:0.5rem}
.doc{font-weight:500}
table.data{width:100%;margin-top:0.75rem;border-collapse:collapse;font-size:0.9375rem;line-height:1.55}
table.data th,table.data td{border-bottom:1px solid var(--line);padding:0.6rem 0;padding-inline-end:0.75rem;text-align:start;vertical-align:top}
table.data thead th{font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--soft);border-bottom-color:var(--rule);white-space:nowrap}
table.data tbody th{font-weight:500}
table.data td .chip{margin-inline-start:0.5rem}
table.pairs th:first-child{width:38%}
.links li{padding:0.35rem 0}
.foot{border-top:1px solid var(--line);padding:2rem 0 3rem;font-size:0.9375rem}
.foot .links{margin-top:1rem}
dl{margin:0.75rem 0 0;display:grid;grid-template-columns:minmax(7rem,max-content) 1fr;gap:0}
dt,dd{margin:0;padding:0.55rem 0;border-bottom:1px solid var(--line)}
dt{color:var(--soft);padding-inline-end:1rem;font-size:0.875rem}
.badges{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem}
.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 0.6rem;font-size:0.8125rem}
.trust.unverified{color:var(--soft)}
.outcome{display:inline-block;font-family:var(--mono);font-weight:600;font-size:0.875rem;margin-inline-end:0.5rem}
.outcome.success{color:var(--ok)}
.outcome.definite-negative,.outcome.transport-failure{color:var(--warn)}
.meaning{display:block;color:var(--soft);font-size:0.875rem}
.rules{margin-top:1rem;padding-inline-start:1.25rem;list-style:disc;color:var(--soft)}
.rules li+li{margin-top:0.4rem}
.lede-line{font-size:1.0625rem}
.detail code{font-size:0.875rem}
.langs:not(:first-child){margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--line)}
.langs ul{display:flex;flex-wrap:wrap;gap:0.25rem 1rem;margin:0}
.langs a{color:var(--soft);text-decoration:none}
.langs a:hover{color:var(--accent);text-decoration:underline}
.langs a[aria-current]{color:var(--ink);font-weight:600}
[dir=rtl] .eyebrow,[dir=rtl] table.data thead th,[dir=rtl] .lapsed,[dir=rtl] .disagree,[dir=rtl] .tag,[dir=rtl] .trust{letter-spacing:0}
@media (max-width:30rem){h1{font-size:1.5rem}.names .name+.name{font-size:1.1875rem}table.pairs th:first-child{width:40%}table.data td .chip{margin:0.35rem 0 0}table.data td .chip{display:flex;width:fit-content;max-width:100%}table.data td.mono{font-size:0.875rem;min-width:calc(14ch + 0.75rem)}}`

function page(p: Page, title: string, body: string, footer = ''): string {
	const lang = p.locale.lang
	return `<!doctype html>
<html lang="${lang}"${RTL.has(lang) ? ' dir="rtl"' : ''}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(
		title,
	)}</title><style>${STYLE}</style></head>
<body>
<header class="top"><div class="shell">${wordmark(p)}</div></header>
<main class="shell">
${body}
</main>
<footer class="foot" data-section="footer"><div class="shell">${footer}${languageList(p)}</div></footer>
</body>
</html>
`
}

function escape(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

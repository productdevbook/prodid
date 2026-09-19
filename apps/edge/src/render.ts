import type { EntityRecord, SourceRecord } from '@prodid/core'

import { type EntityView, entityView, type MediaView, type PropertyView, type ValueView } from './view'

/**
 * The HTML half of every answer, kept whole in this file. It is semantic and unstyled on purpose:
 * `apps/web` replaces it with a designed rendering of the same `EntityView`, and nothing outside
 * this file should have to change when it does.
 */
export interface ProblemBody {
	type: string
	title: string
	status: number
	detail?: string
}

export function renderEntity(entity: EntityRecord): string {
	const view = entityView(entity)
	const sections = [
		heading(`${view.kind} ${view.opid}`),
		definitions([
			['opid', text(view.opid)],
			['kind', text(view.kind)],
			...(view.navigation.family === null ? [] : [['family', link(view.navigation.family.href, view.navigation.family.opid)] as Row]),
			...(view.navigation.variant === null ? [] : [['variant', link(view.navigation.variant.href, view.navigation.variant.opid)] as Row]),
		]),
		view.names.length === 0 ? '' : `${subheading('Names')}\n${valueTable(view.names)}`,
		view.brands.length === 0 ? '' : `${subheading('Brands')}\n${valueTable(view.brands)}`,
		view.identifiers.length === 0 ? '' : identifierTable(view),
		view.properties.length === 0 ? '' : propertyTables(view.properties),
		view.media.length === 0 ? '' : mediaList(view.media),
		links('Children', view.navigation.children),
		links('Merged from', view.navigation.mergedFrom),
	]
	return page(`${view.kind} ${view.opid}`, sections.filter((part) => part !== '').join('\n'))
}

export function renderSource(source: SourceRecord): string {
	const crawl = source.last_crawl
	const rows: Row[] = [
		['name', text(source.name)],
		['kind', text(source.kind)],
		['trust', text(source.trust)],
		['lapsed', text(source.lapsed ? `yes, since ${source.lapsed_at ?? ''}` : 'no')],
	]
	if (source.verified_by !== undefined) rows.push(['verified by', text(`${source.verified_by} at ${source.verified_at ?? ''}`)])
	if (source.license !== undefined) rows.push(['license', text(source.license)])

	const crawlRows: Row[] =
		crawl === undefined
			? []
			: [
					['at', text(crawl.at)],
					['outcome', text(crawl.outcome)],
					...(crawl.via === undefined ? [] : [['via', text(crawl.via)] as Row]),
					...(crawl.document_url === undefined ? [] : [['document', text(crawl.document_url)] as Row]),
					...(crawl.http_status === undefined ? [] : [['http status', text(String(crawl.http_status))] as Row]),
					...(crawl.records_seen === undefined ? [] : [['records seen', text(String(crawl.records_seen))] as Row]),
					...(crawl.records_changed === undefined ? [] : [['records changed', text(String(crawl.records_changed))] as Row]),
					...(crawl.lines_skipped === undefined ? [] : [['lines skipped', text(String(crawl.lines_skipped))] as Row]),
				]

	return page(
		`source ${source.name}`,
		[
			heading(`source ${source.name}`),
			definitions(rows),
			crawlRows.length === 0 ? '<p>No crawl has finished yet.</p>' : `${subheading('Last crawl')}\n${definitions(crawlRows)}`,
		].join('\n'),
	)
}

export function renderProblem(body: ProblemBody): string {
	return page(
		body.title,
		[heading(body.title), `<p>${escape(String(body.status))}</p>`, body.detail === undefined ? '' : `<p>${escape(body.detail)}</p>`]
			.filter((part) => part !== '')
			.join('\n'),
	)
}

type Row = [string, string]

function identifierTable(view: EntityView): string {
	const rows = view.identifiers
		.map(
			(identifier) =>
				`<tr><td>${escape(identifier.scheme)}</td><td>${escape(identifier.value)}</td><td>${escape(identifier.scope ?? '')}</td></tr>`,
		)
		.join('')
	return `${subheading('Identifiers')}
<table><thead><tr><th scope="col">scheme</th><th scope="col">value</th><th scope="col">scope</th></tr></thead><tbody>${rows}</tbody></table>`
}

function propertyTables(properties: readonly PropertyView[]): string {
	return properties
		.map((property) => {
			const title = property.disagreement ? `${property.property} — sources disagree` : property.property
			return `${subheading(title)}\n${valueTable(property.values)}`
		})
		.join('\n')
}

function valueTable(values: readonly ValueView[]): string {
	const rows = values
		.map((entry) => {
			const source = `${entry.source.name} (${entry.source.trust}${entry.source.lapsed ? ', lapsed' : ''})`
			return `<tr><td>${escape(JSON.stringify(entry.value))}</td><td>${escape(entry.lang ?? '')}</td><td>${link(
				entry.source.href,
				source,
			)}</td><td><time datetime="${escape(entry.seenAt)}">${escape(entry.seenAt)}</time></td><td>${escape(
				entry.withdrawnAt ?? '',
			)}</td></tr>`
		})
		.join('')
	return `<table><thead><tr><th scope="col">value</th><th scope="col">lang</th><th scope="col">source</th><th scope="col">seen at</th><th scope="col">withdrawn at</th></tr></thead><tbody>${rows}</tbody></table>`
}

function mediaList(media: readonly MediaView[]): string {
	const items = media
		.map((entry) => {
			const figure =
				entry.kind === 'document' ? link(entry.mediaUrl, entry.mediaUrl) : `<img src="${escape(entry.mediaUrl)}" alt="" loading="lazy">`
			return `<li><figure>${figure}<figcaption>${escape(entry.license)} — ${link(
				entry.source.href,
				entry.source.name,
			)}${entry.withdrawnAt === null ? '' : ' (withdrawn)'}</figcaption></figure></li>`
		})
		.join('')
	return `${subheading('Media')}\n<ul>${items}</ul>`
}

function links(title: string, entries: readonly { opid: string; href: string }[]): string {
	if (entries.length === 0) return ''
	const items = entries.map((entry) => `<li>${link(entry.href, entry.opid)}</li>`).join('')
	return `${subheading(title)}\n<ul>${items}</ul>`
}

function definitions(rows: readonly Row[]): string {
	const body = rows.map(([term, value]) => `<dt>${escape(term)}</dt><dd>${value}</dd>`).join('')
	return `<dl>${body}</dl>`
}

function link(href: string, label: string): string {
	return `<a href="${escape(href)}">${escape(label)}</a>`
}

function text(value: string): string {
	return escape(value)
}

function heading(title: string): string {
	return `<h1>${escape(title)}</h1>`
}

function subheading(title: string): string {
	return `<h2>${escape(title)}</h2>`
}

function page(title: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — prodid</title></head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}

function escape(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

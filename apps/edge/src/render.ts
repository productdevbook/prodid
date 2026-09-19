import type { EntityRecord, SourceRecord } from '@prodid/core'

/**
 * The HTML half of every answer, kept whole in this file. It is semantic and unstyled on purpose:
 * `apps/web` replaces it with a designed rendering of exactly the same data, and nothing outside
 * this file should have to change when it does.
 */
export interface ProblemBody {
	type: string
	title: string
	status: number
	detail?: string
}

export function renderEntity(entity: EntityRecord): string {
	const parents = entity.parents ?? {}
	const sections = [
		heading(`${entity.kind} ${entity.opid}`),
		definitions([
			['opid', text(entity.opid)],
			['kind', text(entity.kind)],
			...(parents.family === undefined ? [] : [['family', link(`/id/${parents.family}`, parents.family)] as Row]),
			...(parents.variant === undefined ? [] : [['variant', link(`/id/${parents.variant}`, parents.variant)] as Row]),
		]),
		entity.identifiers.length === 0 ? '' : identifierTable(entity),
		entity.claims.length === 0 ? '' : claimTable(entity),
		list('Children', entity.children ?? []),
		list('Merged from', entity.merged_from ?? []),
	]
	return page(`${entity.kind} ${entity.opid}`, sections.join('\n'))
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

function identifierTable(entity: EntityRecord): string {
	const rows = entity.identifiers
		.map(
			(identifier) =>
				`<tr><td>${escape(identifier.scheme)}</td><td>${escape(identifier.value)}</td><td>${escape(identifier.scope ?? '')}</td></tr>`,
		)
		.join('')
	return `${subheading('Identifiers')}
<table><thead><tr><th scope="col">scheme</th><th scope="col">value</th><th scope="col">scope</th></tr></thead><tbody>${rows}</tbody></table>`
}

function claimTable(entity: EntityRecord): string {
	const rows = entity.claims
		.map((claim) => {
			const source = `${claim.source.name} (${claim.source.trust}${claim.source.lapsed ? ', lapsed' : ''})`
			const withdrawn = claim.withdrawn_at === undefined ? '' : escape(claim.withdrawn_at)
			return `<tr><td>${escape(claim.property)}</td><td>${escape(JSON.stringify(claim.value))}</td><td>${escape(
				claim.lang ?? '',
			)}</td><td>${escape(source)}</td><td><time datetime="${escape(claim.seen_at)}">${escape(
				claim.seen_at,
			)}</time></td><td>${withdrawn}</td></tr>`
		})
		.join('')
	return `${subheading('Claims')}
<table><thead><tr><th scope="col">property</th><th scope="col">value</th><th scope="col">lang</th><th scope="col">source</th><th scope="col">seen at</th><th scope="col">withdrawn at</th></tr></thead><tbody>${rows}</tbody></table>`
}

function list(title: string, opids: readonly string[]): string {
	if (opids.length === 0) return ''
	const items = opids.map((opid) => `<li>${link(`/id/${opid}`, opid)}</li>`).join('')
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

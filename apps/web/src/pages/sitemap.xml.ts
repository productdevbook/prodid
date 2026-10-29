import type { APIRoute } from 'astro'

import { LOCALES, type PageKey, pagePath } from '@/i18n/locales'

const TRANSLATED_PAGES: { page: PageKey; priority: string }[] = [
	{ page: 'home', priority: '1.0' },
	{ page: 'publish', priority: '0.9' },
	{ page: 'data', priority: '0.8' },
]

export const GET: APIRoute = ({ site }) => {
	const base = site?.href.replace(/\/$/, '') ?? 'https://prodid.org'
	const urls = [
		...TRANSLATED_PAGES.flatMap(({ page, priority }) => {
			const alternates = [
				...LOCALES.map((entry) => `<xhtml:link rel="alternate" hreflang="${entry.hreflang}" href="${base}${pagePath(entry.code, page)}"/>`),
				`<xhtml:link rel="alternate" hreflang="x-default" href="${base}${pagePath('en', page)}"/>`,
			].join('')
			return LOCALES.map(
				(entry) => `  <url><loc>${base}${pagePath(entry.code, page)}</loc><priority>${priority}</priority>${alternates}</url>`,
			)
		}),
		`  <url><loc>${base}/spec</loc><priority>0.9</priority></url>`,
	]
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}

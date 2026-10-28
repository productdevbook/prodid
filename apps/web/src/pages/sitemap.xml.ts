import type { APIRoute } from 'astro'

const PAGES = [
	{ path: '/', priority: '1.0' },
	{ path: '/spec', priority: '0.9' },
	{ path: '/publish', priority: '0.9' },
	{ path: '/data', priority: '0.8' },
]

export const GET: APIRoute = ({ site }) => {
	const base = site?.href.replace(/\/$/, '') ?? 'https://prodid.org'
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((page) => `  <url><loc>${base}${page.path}</loc><priority>${page.priority}</priority></url>`).join('\n')}
</urlset>
`
	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}

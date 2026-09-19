import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
	const base = site?.href.replace(/\/$/, '') ?? 'https://prodid.org'
	return new Response(
		`User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`,
		{ headers: { 'content-type': 'text/plain; charset=utf-8' } },
	)
}

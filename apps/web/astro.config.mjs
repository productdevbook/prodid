// @ts-check
import { createReadStream, existsSync, statSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { satteri, satteriHeadingIdsPlugin } from '@astrojs/markdown-satteri'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { defineHastPlugin } from 'satteri'

import { SHIKI_THEMES } from './src/lib/shiki.ts'

const SPEC = new URL('../../spec/', import.meta.url)

/** Copied verbatim into `dist/spec/` so the relative links inside the rendered spec resolve. */
const PUBLISHED = ['schemas', 'examples', 'LICENSE', 'README.md']

/** @type {Record<string, string>} */
const MEDIA_TYPES = {
	'.json': 'application/json; charset=utf-8',
	'.ndjson': 'application/x-ndjson; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8',
}

/** `schemas/x.json` in the markdown means `spec/schemas/x.json` in the repository, served at `/spec/schemas/x.json`. */
const specLinks = defineHastPlugin({
	name: 'prodid:spec-links',
	element: {
		filter: ['a'],
		visit(node, ctx) {
			const href = node.properties?.href
			if (typeof href !== 'string' || /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(href)) return
			ctx.setProperty(node, 'href', `/spec/${href}`)
		},
	},
})

const headingAnchors = defineHastPlugin({
	name: 'prodid:heading-anchors',
	element: {
		filter: ['h2', 'h3', 'h4', 'h5', 'h6'],
		visit(node, ctx) {
			const id = node.properties?.id
			if (typeof id !== 'string') return
			// No text children: the heading's textContent is read again downstream to build the page's
			// table of contents, and a literal "#" in there would end up in every entry. CSS draws the glyph.
			ctx.appendChild(node, {
				type: 'element',
				tagName: 'a',
				properties: { href: `#${id}`, className: ['heading-anchor'], ariaLabel: `Link to “${ctx.textContent(node)}”` },
				children: [],
			})
		},
	},
})

/** Wide tables have to scroll on a phone without taking the page with them. */
const scrollableTables = defineHastPlugin({
	name: 'prodid:scrollable-tables',
	element: {
		filter: ['table'],
		visit(node, ctx) {
			ctx.wrapNode(node, {
				type: 'element',
				tagName: 'div',
				properties: { className: ['table-scroll'], role: 'region', tabIndex: 0 },
				children: [],
			})
		},
	},
})

/**
 * The spec is the source of truth and lives outside this app; the build reads it and refuses to run without it.
 *
 * @returns {import('astro').AstroIntegration}
 */
function specAssets() {
	return {
		name: 'prodid:spec-assets',
		hooks: {
			'astro:config:setup': () => {
				const missing = PUBLISHED.filter((name) => !existsSync(new URL(name, SPEC)))
				if (missing.length > 0) {
					throw new Error(
						`apps/web serves spec/{${missing.join(',')}} under /spec/, but ${missing
							.map((name) => fileURLToPath(new URL(name, SPEC)))
							.join(', ')} does not exist.`,
					)
				}
			},
			'astro:server:setup': ({ server }) => {
				server.middlewares.use((req, res, next) => {
					const path = (req.url ?? '').split('?')[0] ?? ''
					if (!path.startsWith('/spec/')) return next()
					const rest = decodeURIComponent(path.slice('/spec/'.length))
					if (rest === '' || rest.includes('..')) return next()
					const file = new URL(rest, SPEC)
					if (!existsSync(file) || !statSync(file).isFile()) return next()
					res.setHeader('content-type', MEDIA_TYPES[extname(rest)] ?? 'text/plain; charset=utf-8')
					createReadStream(file).pipe(res)
				})
			},
			'astro:build:done': async ({ dir }) => {
				for (const name of PUBLISHED) {
					await cp(new URL(name, SPEC), new URL(`spec/${name}`, dir), { recursive: true })
				}
			},
		},
	}
}

export default defineConfig({
	site: 'https://prodid.org',
	output: 'static',
	integrations: [specAssets()],
	markdown: {
		shikiConfig: { themes: SHIKI_THEMES, defaultColor: false, wrap: false },
		// Astro appends its own heading-ids plugin after these, so the ids the anchors link to have to be
		// assigned here first. Astro's pass keeps an id that already exists, so running it twice is a no-op.
		processor: satteri({
			hastPlugins: [satteriHeadingIdsPlugin(), specLinks, headingAnchors, scrollableTables],
		}),
	},
	vite: { plugins: [tailwindcss()] },
})

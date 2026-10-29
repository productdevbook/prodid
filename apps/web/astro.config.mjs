// @ts-check
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { extname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

import { satteri, satteriHeadingIdsPlugin } from '@astrojs/markdown-satteri'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { defineHastPlugin } from 'satteri'

import { LOCALES, PAGES, pagePath } from './src/i18n/locales.ts'
import { SHIKI_LANG_ALIAS, SHIKI_THEMES } from './src/lib/shiki.ts'
import { readSpecSections } from './src/lib/spec-sections.ts'

const SPEC = new URL('../../spec/', import.meta.url)
const REVIEW = new URL('./spec-review.json', import.meta.url)

/** Copied verbatim into `dist/spec/` so the relative links inside the rendered spec resolve. */
const PUBLISHED = ['schemas', 'examples', 'fixtures', 'LICENSE', 'README.md', 'v1-from-v0.md']

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

/** Wide tables have to scroll on a phone without taking the page with them, and a focusable region needs a name. */
const scrollableTables = defineHastPlugin({
	name: 'prodid:scrollable-tables',
	element: [
		{
			filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
			visit(node, ctx) {
				ctx.data.section = ctx.textContent(node)
				ctx.data.sectionTables = 0
			},
		},
		{
			filter: ['table'],
			visit(node, ctx) {
				const section = typeof ctx.data.section === 'string' ? ctx.data.section : 'The specification'
				const seen = (typeof ctx.data.sectionTables === 'number' ? ctx.data.sectionTables : 0) + 1
				ctx.data.sectionTables = seen
				ctx.wrapNode(node, {
					type: 'element',
					tagName: 'div',
					properties: {
						className: ['table-scroll'],
						role: 'region',
						tabIndex: 0,
						ariaLabel: seen === 1 ? `${section} table` : `${section} table ${seen}`,
					},
					children: [],
				})
			},
		},
	],
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
				checkQuotedSpec()
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
			'astro:build:done': async ({ dir, logger }) => {
				for (const name of PUBLISHED) {
					await cp(new URL(name, SPEC), new URL(`spec/${name}`, dir), { recursive: true })
				}
				const checked = checkInternalLinks(fileURLToPath(dir))
				logger.info(`internal links resolved: ${checked}`)
				const quoted = checkQuotedAnchorsRendered(fileURLToPath(dir))
				logger.info(`spec sections quoted by hand-written pages: ${quoted}, unchanged since review`)
			},
		},
	}
}

function htmlFilesIn(/** @type {string} */ root) {
	/** @type {string[]} */
	const found = []
	const walk = (/** @type {string} */ rel) => {
		for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
			const next = rel === '' ? entry.name : posix.join(rel, entry.name)
			if (entry.isDirectory()) walk(next)
			else if (entry.name.endsWith('.html')) found.push(next)
		}
	}
	walk('')
	return found
}

/**
 * Every internal href in the built HTML has to point at something that was actually published. The spec's own
 * links come from markdown nobody here writes, so a section renamed upstream has to break the build rather
 * than ship as a dead link. Checked against `dist`, not against the copy list, so a copy rule that misses a
 * directory fails here too.
 *
 * @param {string} dist
 */
function checkInternalLinks(dist) {
	const pages = htmlFilesIn(dist)
	/** @type {Map<string, string>} */
	const bodies = new Map(pages.map((page) => [page, readFileSync(join(dist, page), 'utf8')]))

	/** @param {string} path */
	const resolve = (path) => {
		const rel = decodeURIComponent(path.replace(/^\/+/, ''))
		if (rel.includes('..')) return null
		for (const candidate of [rel, posix.join(rel, 'index.html'), `${rel}.html`]) {
			const full = join(dist, candidate)
			if (existsSync(full) && statSync(full).isFile()) return candidate
		}
		return null
	}

	/** @type {string[]} */
	const broken = []
	let count = 0

	for (const [page, html] of bodies) {
		const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
		for (const match of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
			const href = match[1] ?? ''
			if (href === '' || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue
			count++
			if (href.startsWith('#')) {
				if (!ids.has(href.slice(1))) broken.push(`${page} → ${href} (no such id on the page)`)
				continue
			}
			if (!href.startsWith('/')) {
				broken.push(`${page} → ${href} (relative link; nothing rewrites these)`)
				continue
			}
			const [path = '', fragment] = href.split('#')
			const target = resolve(path.split('?')[0] ?? '')
			if (target === null) {
				broken.push(`${page} → ${href} (nothing published at that path)`)
				continue
			}
			if (fragment !== undefined && target.endsWith('.html')) {
				const body = bodies.get(target) ?? readFileSync(join(dist, target), 'utf8')
				if (!new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])).has(fragment)) {
					broken.push(`${page} → ${href} (no id "${fragment}" in ${target})`)
				}
			}
		}
	}

	if (broken.length > 0) {
		throw new Error(`${broken.length} internal link(s) do not resolve in the build:\n  ${broken.join('\n  ')}`)
	}
	return count
}

/**
 * `/` and `/publish` state rules that live in spec/README.md, in their own words, so no build-time render can keep
 * them honest. This records a hash of every section they quote: when the spec moves, the build stops and names the
 * section, instead of the site quietly going on saying the old rule.
 *
 * @returns {{ sections: ReturnType<typeof readSpecSections>, manifest: import('./src/lib/spec-sections.ts').SpecReview }}
 */
function loadQuotedSpec() {
	const manifest = /** @type {import('./src/lib/spec-sections.ts').SpecReview} */ (JSON.parse(readFileSync(fileURLToPath(REVIEW), 'utf8')))
	const sections = readSpecSections(readFileSync(fileURLToPath(new URL('README.md', SPEC)), 'utf8'))
	return { sections, manifest }
}

/**
 * Every language restates the same sections, so a section recorded for one language's page is recorded for all of
 * them: a spec change then names each translation that has to be read again, not only the English page.
 *
 * @param {import('./src/lib/spec-sections.ts').SpecReview} manifest
 */
function checkQuotedInEveryLanguage(manifest) {
	const pages = /** @type {(keyof typeof PAGES)[]} */ (Object.keys(PAGES))
	/** @type {string[]} */
	const problems = []
	for (const entry of manifest.sections) {
		const listed = new Set(entry.pages)
		for (const path of entry.pages) {
			const page = pages.find((key) => LOCALES.some((locale) => pagePath(locale.code, key) === path))
			if (page === undefined) {
				problems.push(`  #${entry.anchor} — ${path} is not a page the site publishes in its languages`)
				continue
			}
			const missing = LOCALES.map((locale) => pagePath(locale.code, page)).filter((localized) => !listed.has(localized))
			if (missing.length > 0) problems.push(`  #${entry.anchor} — quoted by ${path} but not recorded for ${missing.join(', ')}`)
		}
	}
	if (problems.length > 0) {
		throw new Error(
			`spec-review.json has to record each quoted section for every language of the page:\n${[...new Set(problems)].join('\n')}`,
		)
	}
}

function checkQuotedSpec() {
	const { sections, manifest } = loadQuotedSpec()
	checkQuotedInEveryLanguage(manifest)
	/** @type {string[]} */
	const gone = []
	/** @type {string[]} */
	const drifted = []
	for (const entry of manifest.sections) {
		const section = sections.get(entry.anchor)
		if (section === undefined) {
			gone.push(`  #${entry.anchor} — quoted by ${entry.pages.join(', ')} — no section renders to that anchor any more`)
			continue
		}
		if (section.sha256 !== entry.sha256) {
			drifted.push(`  #${entry.anchor} — “${section.heading}” — quoted by ${entry.pages.join(', ')}`)
		}
	}
	if (gone.length === 0 && drifted.length === 0) return

	const lines = ['spec/README.md has moved under the hand-written pages.', '']
	if (gone.length > 0) lines.push('Sections that no longer exist under the recorded anchor:', ...gone, '')
	if (drifted.length > 0) lines.push(`Sections changed since /publish and / were last reviewed (${manifest.reviewed}):`, ...drifted, '')
	lines.push(
		'These pages restate those rules in their own words, so nothing else catches a change.',
		'Read the section, fix the page if the rule moved, then record the new text:',
		'',
		'  cd apps/web && bun run spec:review',
	)
	throw new Error(lines.join('\n'))
}

/** @param {string} dist */
function checkQuotedAnchorsRendered(dist) {
	const { manifest } = loadQuotedSpec()
	const page = readFileSync(join(dist, 'spec', 'index.html'), 'utf8')
	const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
	const absent = manifest.sections.filter((entry) => !ids.has(entry.anchor))
	if (absent.length > 0) {
		throw new Error(`spec-review.json records anchors that /spec does not render: ${absent.map((e) => `#${e.anchor}`).join(', ')}`)
	}
	return manifest.sections.length
}

export default defineConfig({
	site: 'https://prodid.org',
	output: 'static',
	integrations: [specAssets()],
	markdown: {
		shikiConfig: { themes: SHIKI_THEMES, langAlias: SHIKI_LANG_ALIAS, defaultColor: false, wrap: false },
		// Astro appends its own heading-ids plugin after these, so the ids the anchors link to have to be
		// assigned here first. Astro's pass keeps an id that already exists, so running it twice is a no-op.
		processor: satteri({
			hastPlugins: [satteriHeadingIdsPlugin(), specLinks, headingAnchors, scrollableTables],
		}),
	},
	vite: { plugins: [tailwindcss()] },
})

import { readFileSync, writeFileSync } from 'node:fs'

import { readSpecSections, type SpecReview } from '../src/lib/spec-sections.ts'

const MANIFEST = new URL('../spec-review.json', import.meta.url)
const SPEC = new URL('../../../spec/README.md', import.meta.url)

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as SpecReview
const sections = readSpecSections(readFileSync(SPEC, 'utf8'))

const args = process.argv.slice(2)
const all = args.includes('--all')
const named = new Set(args.filter((arg) => !arg.startsWith('-')).map((arg) => arg.replace(/^#/, '')))

const missing = manifest.sections.filter((entry) => !sections.has(entry.anchor))
if (missing.length > 0) {
	console.error(`These sections are no longer in spec/README.md under that anchor:\n  ${missing.map((e) => `#${e.anchor}`).join('\n  ')}`)
	console.error('Find where the rule went, fix the pages, then edit spec-review.json to name the new anchors.')
	process.exit(1)
}

const drifted = manifest.sections.filter((entry) => sections.get(entry.anchor)?.sha256 !== entry.sha256)

if (drifted.length === 0) {
	console.log('Nothing has drifted.')
	process.exit(0)
}

const unknown = [...named].filter((anchor) => !manifest.sections.some((entry) => entry.anchor === anchor))
if (unknown.length > 0) {
	console.error(`Not recorded in spec-review.json: ${unknown.map((a) => `#${a}`).join(', ')}`)
	process.exit(1)
}

// Re-recording is a claim that someone read the section and checked the page, so it is never the default for a
// section nobody named. Otherwise one reviewed change quietly re-records every other one that drifted with it.
if (!all && named.size === 0) {
	console.error(`${drifted.length} section(s) have drifted:\n`)
	for (const entry of drifted) {
		console.error(`  #${entry.anchor} — “${sections.get(entry.anchor)?.heading}” — quoted by ${entry.pages.join(', ')}`)
	}
	console.error('\nRead each against the page it is quoted by, then name the ones you have checked:\n')
	console.error(`  bun run spec:review ${drifted.map((e) => e.anchor).join(' ')}`)
	console.error('\n…or `bun run spec:review --all` if you have read all of them.')
	process.exit(1)
}

const recording = all ? drifted : drifted.filter((entry) => named.has(entry.anchor))
const untouched = drifted.filter((entry) => !recording.includes(entry))

for (const entry of recording) {
	entry.sha256 = sections.get(entry.anchor)?.sha256 ?? entry.sha256
}
if (untouched.length === 0) manifest.reviewed = new Date().toISOString().slice(0, 10)

// Single-element arrays on one line, so re-recording does not fail the repository's format check.
const serialized = JSON.stringify(manifest, null, '\t').replace(/\[\n\t+("[^"]*")\n\t+\]/g, '[$1]')
writeFileSync(MANIFEST, `${serialized}\n`)

console.log(`Re-recorded ${recording.length} section(s):`)
for (const entry of recording) console.log(`  #${entry.anchor} — quoted by ${entry.pages.join(', ')}`)
if (untouched.length > 0) {
	console.log(`\nStill drifted, not named: ${untouched.map((e) => `#${e.anchor}`).join(', ')}`)
	process.exit(1)
}

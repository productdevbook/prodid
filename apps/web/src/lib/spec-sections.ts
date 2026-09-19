import { createHash } from 'node:crypto'

export interface SpecReview {
	note: string
	reviewed: string
	sections: { anchor: string; pages: string[]; sha256: string }[]
}

export interface SpecSection {
	anchor: string
	heading: string
	depth: number
	/** The section's own prose, excluding its subsections, so a change in one does not flag the other. */
	body: string
	sha256: string
}

/** The text a heading renders to, which is what the slug and the hash are taken from. */
function headingText(raw: string): string {
	return raw
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/`/g, '')
		.trim()
}

/** github-slugger's result for these headings, which is the id Astro puts on the rendered page. */
export function anchorFor(raw: string): string {
	return headingText(raw)
		.toLowerCase()
		.replace(/[^a-z0-9 _-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
}

function normalize(lines: string[]): string {
	const trimmed = lines.map((line) => line.replace(/\s+$/, ''))
	while (trimmed.length > 0 && trimmed[0] === '') trimmed.shift()
	while (trimmed.length > 0 && trimmed.at(-1) === '') trimmed.pop()
	return trimmed.join('\n')
}

export function readSpecSections(markdown: string): Map<string, SpecSection> {
	const lines = markdown.split('\n')
	const sections = new Map<string, SpecSection>()
	let fenced = false
	let current: { anchor: string; heading: string; depth: number; from: number } | undefined

	const close = (until: number) => {
		if (current === undefined) return
		const body = normalize(lines.slice(current.from, until))
		sections.set(current.anchor, {
			anchor: current.anchor,
			heading: current.heading,
			depth: current.depth,
			body,
			sha256: createHash('sha256').update(`${current.heading}\n${body}`, 'utf8').digest('hex'),
		})
	}

	for (const [index, line] of lines.entries()) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
		if (fenced) continue
		const heading = /^(#{1,6})\s+(.*)$/.exec(line)
		if (heading === null) continue
		close(index)
		const hashes = heading[1] ?? ''
		const text = headingText(heading[2] ?? '')
		current = { anchor: anchorFor(heading[2] ?? ''), heading: text, depth: hashes.length, from: index + 1 }
	}
	close(lines.length)
	return sections
}

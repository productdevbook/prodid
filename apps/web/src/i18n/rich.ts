import { type LocaleCode, localize } from '@/i18n/locales'

export const LINK = 'rounded-sm text-brand underline underline-offset-4'
const MONO_LINK = `${LINK} font-mono text-[0.8125rem] [overflow-wrap:anywhere]`

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(text: string): string {
	return escape(text)
		.replace(/`([^`]+)`/g, '<code class="chip">$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-medium text-ink">$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

/**
 * The copy's own markup: `code`, **strong**, *em* and [text](href). A link to `/`, `/publish` or `/data` goes to the
 * same page in the reader's language; a link whose whole text is `code` is set in mono rather than as a chip.
 */
export function rich(text: string, code: LocaleCode): string {
	let html = ''
	let rest = text
	for (let match = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest); match !== null; match = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)) {
		const [whole, label = '', href = ''] = match
		html += inline(rest.slice(0, match.index))
		const mono = /^`[^`]+`$/.exec(label)
		html += `<a href="${escape(localize(code, href))}" class="${mono ? MONO_LINK : LINK}">${mono ? escape(label.slice(1, -1)) : inline(label)}</a>`
		rest = rest.slice(match.index + whole.length)
	}
	return html + inline(rest)
}

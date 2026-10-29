import { ar } from './ar'
import { de } from './de'
import { type Catalogue, en } from './en'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import { ptBR } from './pt-br'
import { ru } from './ru'
import { tr } from './tr'
import { zhHans } from './zh-hans'

export type { Catalogue } from './en'

export const LANGUAGES = ['en', 'zh-Hans', 'es', 'ar', 'fr', 'ru', 'pt-BR', 'de', 'ja', 'tr'] as const

export type Language = (typeof LANGUAGES)[number]

export const CATALOGUES: Readonly<Record<Language, Catalogue>> = {
	en,
	'zh-Hans': zhHans,
	es,
	ar,
	fr,
	ru,
	'pt-BR': ptBR,
	de,
	ja,
	tr,
}

export const NATIVE_NAMES: Readonly<Record<Language, string>> = {
	en: 'English',
	'zh-Hans': '中文',
	es: 'Español',
	ar: 'العربية',
	fr: 'Français',
	ru: 'Русский',
	'pt-BR': 'Português',
	de: 'Deutsch',
	ja: '日本語',
	tr: 'Türkçe',
}

export const RTL: ReadonlySet<Language> = new Set<Language>(['ar'])

/** Every `zh` is served `zh-Hans` and every `pt` is served `pt-BR`: the nearest catalogue there is. */
const BY_PRIMARY = new Map<string, Language>(LANGUAGES.map((language) => [language.split('-')[0]!.toLowerCase(), language]))

const TAG = /^[a-z]{1,8}(-[a-z0-9]{1,8})*$/i

export interface Locale {
	lang: Language
	/** The language came from `?lang=`, so the URL alone decides the answer. */
	fromQuery: boolean
	search: string
}

export const ENGLISH: Locale = { lang: 'en', fromQuery: false, search: '' }

export function matchLanguage(tag: string): Language | null {
	const written = tag.trim()
	if (!TAG.test(written)) return null
	const lower = written.toLowerCase()
	const exact = LANGUAGES.find((language) => language.toLowerCase() === lower)
	return exact ?? BY_PRIMARY.get(lower.split('-')[0]!) ?? null
}

export function negotiateLanguage(header: string | null): Language | null {
	if (header === null) return null
	const ranges: { tag: string; q: number; at: number }[] = []
	for (const [at, part] of header.split(',').entries()) {
		const [range, ...parameters] = part.split(';')
		const tag = (range ?? '').trim()
		if (tag === '' || tag === '*') continue
		let q = 1
		for (const parameter of parameters) {
			const [name, value] = parameter.split('=')
			if ((name ?? '').trim().toLowerCase() !== 'q') continue
			const parsed = Number((value ?? '').trim())
			q = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0
		}
		if (q > 0) ranges.push({ tag, q, at })
	}
	ranges.sort((a, b) => b.q - a.q || a.at - b.at)
	for (const range of ranges) {
		const language = matchLanguage(range.tag)
		if (language !== null) return language
	}
	return null
}

export function chooseLocale(request: Request): Locale {
	const url = new URL(request.url)
	const asked = url.searchParams.get('lang')
	const chosen = asked === null ? null : matchLanguage(asked)
	if (chosen !== null) return { lang: chosen, fromQuery: true, search: url.search }
	return { lang: negotiateLanguage(request.headers.get('accept-language')) ?? 'en', fromQuery: false, search: url.search }
}

/** A link to `?lang=` on the current URL, relative so it can never point at another path or host. */
export function languageHref(locale: Locale, language: Language): string {
	const params = new URLSearchParams(locale.search)
	params.set('lang', language)
	return `?${params}`
}

export function localHref(locale: Locale, href: string): string {
	if (!locale.fromQuery) return href
	return `${href}${href.includes('?') ? '&' : '?'}lang=${encodeURIComponent(locale.lang)}`
}

export function primarySubtag(tag: string): string {
	return tag.split('-')[0]!.toLowerCase()
}

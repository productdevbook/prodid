export const LOCALES = [
	{ code: 'en', prefix: '', hreflang: 'en', og: 'en', name: 'English', dir: 'ltr' },
	{ code: 'zh', prefix: '/zh', hreflang: 'zh-Hans', og: 'zh_CN', name: '中文', dir: 'ltr' },
	{ code: 'es', prefix: '/es', hreflang: 'es', og: 'es_ES', name: 'Español', dir: 'ltr' },
	{ code: 'ar', prefix: '/ar', hreflang: 'ar', og: 'ar_AR', name: 'العربية', dir: 'rtl' },
	{ code: 'fr', prefix: '/fr', hreflang: 'fr', og: 'fr_FR', name: 'Français', dir: 'ltr' },
	{ code: 'ru', prefix: '/ru', hreflang: 'ru', og: 'ru_RU', name: 'Русский', dir: 'ltr' },
	{ code: 'pt', prefix: '/pt', hreflang: 'pt-BR', og: 'pt_BR', name: 'Português', dir: 'ltr' },
	{ code: 'de', prefix: '/de', hreflang: 'de', og: 'de_DE', name: 'Deutsch', dir: 'ltr' },
	{ code: 'ja', prefix: '/ja', hreflang: 'ja', og: 'ja_JP', name: '日本語', dir: 'ltr' },
	{ code: 'tr', prefix: '/tr', hreflang: 'tr', og: 'tr_TR', name: 'Türkçe', dir: 'ltr' },
] as const

export type Locale = (typeof LOCALES)[number]
export type LocaleCode = Locale['code']

export const TRANSLATED = LOCALES.filter((entry) => entry.code !== 'en')

export const PAGES = { home: '/', publish: '/publish', data: '/data' } as const

export type PageKey = keyof typeof PAGES

export function localeOf(code: LocaleCode): Locale {
	return LOCALES.find((entry) => entry.code === code) ?? LOCALES[0]
}

export function pagePath(code: LocaleCode, page: PageKey): string {
	const { prefix } = localeOf(code)
	const path = PAGES[page]
	if (prefix === '') return path
	return path === '/' ? `${prefix}/` : `${prefix}${path}`
}

export function localize(code: LocaleCode, href: string): string {
	const [path = '', fragment] = href.split('#')
	const page = (Object.keys(PAGES) as PageKey[]).find((key) => PAGES[key] === path)
	if (page === undefined) return href
	const target = pagePath(code, page)
	return fragment === undefined ? target : `${target}#${fragment}`
}

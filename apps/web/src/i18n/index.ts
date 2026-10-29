import { ar } from '@/i18n/ar'
import type { Copy } from '@/i18n/copy'
import { de } from '@/i18n/de'
import { en } from '@/i18n/en'
import { es } from '@/i18n/es'
import { fr } from '@/i18n/fr'
import { ja } from '@/i18n/ja'
import type { LocaleCode } from '@/i18n/locales'
import { pt } from '@/i18n/pt'
import { ru } from '@/i18n/ru'
import { tr } from '@/i18n/tr'
import { zh } from '@/i18n/zh'

const COPY: Record<LocaleCode, Copy> = { en, zh, es, ar, fr, ru, pt, de, ja, tr }

export function copyFor(code: LocaleCode): Copy {
	return COPY[code]
}

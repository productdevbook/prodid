import type { en } from '@/i18n/en'

type Widen<T> = T extends string
	? string
	: T extends (...args: infer A) => string
		? (...args: A) => string
		: T extends readonly unknown[]
			? { readonly [K in keyof T]: Widen<T[K]> }
			: T extends object
				? { readonly [K in keyof T]: Widen<T[K]> }
				: T

export type Copy = Widen<typeof en>

export const REPOSITORY = 'https://github.com/productdevbook/prodid'
export const CONTRIBUTING = `${REPOSITORY}/blob/main/CONTRIBUTING.md`

const API = 'https://api.github.com/repos/productdevbook/prodid'
const SHOWN_FROM = 10

export function formatStars(count: number, hreflang: string): string {
	return new Intl.NumberFormat(`${hreflang}-u-nu-latn`, { notation: 'compact' }).format(count)
}

let pending: Promise<number | undefined> | undefined

/** Read once per build. A star count is a nicety: any failure leaves the link without a number and the build goes on. */
export function fetchStars(): Promise<number | undefined> {
	pending ??= readStars()
	return pending
}

async function readStars(): Promise<number | undefined> {
	const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'prodid.org build' }
	const token = process.env.GITHUB_TOKEN
	if (token !== undefined && token !== '') headers.authorization = `Bearer ${token}`
	try {
		const response = await fetch(API, { headers, signal: AbortSignal.timeout(10_000) })
		if (!response.ok) return undefined
		const body: unknown = await response.json()
		if (typeof body !== 'object' || body === null || !('stargazers_count' in body)) return undefined
		const count = body.stargazers_count
		return typeof count === 'number' && Number.isSafeInteger(count) && count >= SHOWN_FROM ? count : undefined
	} catch {
		return undefined
	}
}

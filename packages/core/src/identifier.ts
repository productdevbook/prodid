import { parseGtin } from './gtin'
import type { RecordIdentifier } from './record/types'

export interface NormalizedIdentifier {
	scheme: string
	scope: string
	value: string
}

export interface IdentifierScope {
	/** The record's brand, which scopes `mpn`. */
	brand?: string
	/** The index's `source.id`, which scopes `sku`. Opaque: it is never parsed or case folded. */
	sourceScope?: string
}

/** The form a brand is compared in: NFKC, case folded, whitespace collapsed. */
export function normalizeBrand(brand: string): string {
	return brand.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/** Normalizes a published identifier into the `(scheme, scope, value)` triple the index is unique on. */
export function normalizeIdentifier(identifier: RecordIdentifier, scope: IdentifierScope = {}): NormalizedIdentifier | null {
	const scheme = identifier.scheme.trim().toLowerCase()
	const value = identifier.value.trim()
	if (scheme === '' || value === '') return null
	switch (scheme) {
		case 'gtin': {
			const gtin = parseGtin(value)
			return gtin.ok ? { scheme, scope: '', value: gtin.value } : null
		}
		case 'mpn':
			return { scheme, scope: scope.brand === undefined ? '' : normalizeBrand(scope.brand), value }
		case 'sku':
			return { scheme, scope: scope.sourceScope ?? '', value }
		default:
			return { scheme, scope: '', value }
	}
}

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

/**
 * The form a brand is compared in: NFKC, case folded, whitespace collapsed. The dotted and dotless
 * I are folded together, because `ARÇELİK`, `Arçelik`, `IŞIK` and `Işık` are one brand each and
 * splitting them costs a publisher their MPN scope. A collision would also need the same MPN.
 */
export function normalizeBrand(brand: string): string {
	return brand
		.normalize('NFKC')
		.toLowerCase()
		.replaceAll(/[İı]/gu, 'i')
		.replaceAll(/i̇/gu, 'i')
		.replaceAll(/\s+/gu, ' ')
		.trim()
}

/** Normalizes a published identifier into the `(scheme, scope, value)` triple the index is unique on. */
export function normalizeIdentifier(identifier: RecordIdentifier, scope: IdentifierScope = {}): NormalizedIdentifier | null {
	const scheme = identifier.scheme.trim().toLowerCase()
	const value = identifier.value.trim()
	if (scheme === '' || value === '') return null
	switch (scheme) {
		case 'gtin': {
			const gtin = parseGtin(value)
			if (!gtin.ok) return null
			// A restricted-circulation number is not a GTIN anyone else can resolve: it belongs to its source.
			if (gtin.restricted) return { scheme: 'rcn', scope: scope.sourceScope ?? '', value: gtin.value }
			return { scheme, scope: '', value: gtin.value }
		}
		case 'mpn':
			return { scheme, scope: scope.brand === undefined ? '' : normalizeBrand(scope.brand), value }
		case 'rcn':
		case 'sku':
			return { scheme, scope: scope.sourceScope ?? '', value }
		default:
			return { scheme, scope: '', value }
	}
}

# 01 · Identity and records

What an entity, an identifier, a record and a claim are. Normative text: spec sections
*Identity*, *Identifiers*, *Records*, *Claims*. Everything in this chapter exists; it is the
foundation the other chapters build on, and it changes only through the spec.

## opid

- **[Exists]** 16 characters of lowercase Crockford base32, `^[0-9a-hjkmnp-tv-z]{16}$`, minted by
  the index, opaque, never reused, never deleted. `packages/core/src/opid.ts` (`mintOpid`,
  `encodeOpid`, `isOpid`, `OPID_PATTERN`); test `packages/core/test/opid.test.ts`.
- **[Exists]** Kinds `family`, `variant`, `item`, always three levels; an item without variant axes
  gets a variant of its own. The database enforces the parent's kind (`db/migrations/0001_init.sql`).

## Identifiers

- **[Exists]** `{ scheme, value }`, lowercase schemes; well-known: `gtin`, `rcn`, `mpn`, `sku`,
  `asin`, `udi-di`, `eprel`, `fcc-id`; unknown schemes stored. `packages/core/src/identifier.ts`.
- **[Exists]** Scoped schemes: `mpn` by normalized brand, `sku` and `rcn` by source `id` (shown to
  readers as the source's current name). Every other scheme is global and carries no scope.
- **[Exists]** GTIN: 8/12/13/14 digits, check digit, all zeros invalid, stored as GTIN-14;
  restricted circulation numbers become `rcn`, classified on the normalized 14-digit form.
  `packages/core/src/gtin.ts`; vectors `spec/fixtures/gtin/` (28 cases).
- **[Exists]** Brand normalization: NFKC, locale-independent lowercase, `ı` → `i` and removal of the
  whole run of U+0307 after an `i`, whitespace collapsed; idempotent. `normalizeBrand` in
  `identifier.ts`; vectors `spec/fixtures/brand/` (13 cases).

## Records

- **[Exists]** `org.prodid.item`: required `$type`, `key`, `brand`, `name`, `identifiers`; optional
  `lang`, `group`, `variant`, `category` (GPC brick), `markets`, `properties`, `media`.
  `spec/schemas/org.prodid.item.json`; validators generated into
  `packages/core/src/record/validators.generated.js` by `packages/core/scripts/build-validators.ts`.
- **[Exists]** Rules the schema cannot state: storable strings (no U+0000, no lone surrogate), a
  `gtin` must be a GTIN, at least one storable identifier. `packages/core/src/record/index.ts`;
  fixtures `spec/fixtures/invalid/item.*`.
- **[Exists]** `schema-drift.test.ts` fails when the TypeScript types and the schemas disagree.

## Claims

- **[Exists]** One claim per fact under `brand`, `name`, `category`, `markets` (per code), `media`
  (per stored file), `variant.<axis>`, `properties.<name>`; `lang` only on text the publisher wrote.
  `packages/core/src/claims.ts` (`deriveRecord`, `deriveClaims`, `deriveIdentifiers`,
  `pendingMedia`, `mediaClaim`).
- **[Exists]** Value equality is RFC 8785 canonical JSON (`packages/core/src/canonical.ts`).
- **[Exists]** Grouping keys and their SHA-256 digests come from core (`groupingKeys`,
  `groupingDigests`), so no caller computes them by hand.

## As built

- Core is pure TypeScript with no I/O; it runs in Workers, in bun and in the browser. Its only
  runtime dependencies are `ajv`, `ajv-formats` and `tldts` (`packages/core/package.json`). Chapter
  07 publishes it.

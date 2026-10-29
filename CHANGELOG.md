# Changelog

One section per package release. The package version is not the protocol version: both packages
implement spec v1 (`spec/README.md`, *Versions*), and v1 changes only by addition.

## 0.0.1 — 2026-10-29

First release of both packages.

### `@prodid/spec` 0.0.1

- The JSON Schemas of spec v1 under `schemas/v1/` and of v0 under `schemas/`.
- The examples, and every conformance vector with its `expected.json`: documents and records (v0
  and v1), dumps, NDJSON, Merchant, Wikidata, TXT, GTIN and brand.
- The specification as the package README, including *Writing a conformance runner*.

### `@prodid/core` 0.0.1

- Validators for v0 and v1 documents, chosen by `version` or pinned with `{ version }`; v0
  discovery documents accepted for crawls that start before 2027-01-26T00:00:00Z.
- GTIN, opid and identifier rules, record validation, claims, discovery rules, NDJSON reading, and
  the Merchant and Wikidata mappings.
- ESM with type declarations; the generated validators are bundled.

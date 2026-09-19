# prodid

An open identity and data layer for every physical product.

A barcode is not a product. The same product carries different barcodes across countries, packagings and years, and its data is scattered across manufacturers, retailers, registries and open databases. prodid gives every product a permanent open identifier, resolves GTIN, MPN and every other code to it, and keeps every fact as a claim attributed to its source.

- Manufacturers publish their own data on their own domain.
- The index is replaceable: the spec, the identifiers and full data dumps are open.
- `https://prodid.org/01/{gtin}` follows GS1 Digital Link syntax, so the QR code on a product resolves to its open record.

## Layout

| path | contents | license |
| --- | --- | --- |
| [`spec/`](spec/) | specification, JSON Schemas, examples | CC0 |
| everything else | code | Apache-2.0 |

## Status

Spec v0 draft. No server yet.

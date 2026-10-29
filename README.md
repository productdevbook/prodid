# prodid

An open identity and data layer for every physical product.

A barcode is not a product: the same product carries different barcodes across countries,
packagings and years, and its data is scattered across manufacturers, retailers, registries and
open databases. prodid gives every product a permanent open identifier, resolves GTIN, MPN and
every other code to it, and keeps every fact as a claim attributed to its source. Manufacturers
publish their own data on their own domain; `https://prodid.org/01/{gtin}` follows GS1 Digital
Link syntax, so the QR code on a product resolves to its open record; and the index is
replaceable, because the spec, the identifiers and full data dumps are open.

## Status

Spec v0 draft. The index and the hosted publisher run on prodid.org. Anyone can publish, on their
own domain or hosted.

## Quick start

With [Bun](https://bun.sh) 1.4.4 and `bzip2` (the Wikidata import reads compressed dumps through it):

```sh
git clone https://github.com/productdevbook/prodid
cd prodid
bun install --frozen-lockfile
bun run check
```

`bun run check` runs format, lint, typecheck, the tests and the spec fixtures. Its
database-backed tests run only when `DATABASE_URL` reaches a Postgres (without it, the dev value in
`db/.env.example`) and skip otherwise. With Docker, start the dev Postgres and run the database
tests too:

```sh
bun run --filter '@prodid/db' up
DATABASE_URL=postgres://prodid:prodid@127.0.0.1:54329/prodid bun run check:db
```

## Layout

| path | contents | license |
| --- | --- | --- |
| [`spec/`](spec/) | specification, JSON Schemas, examples | CC0 |
| everything else | code | Apache-2.0 |

## Links

- [The specification](spec/README.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the reference implementation is built
- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to contribute
- [`docs/self-hosting.md`](docs/self-hosting.md): running an index yourself
- [prodid.org](https://prodid.org)

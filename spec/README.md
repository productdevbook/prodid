# prodid spec v0

Status: draft. Anything here may change until v1.

## Identity

Every entity in the index has an `opid`: 16 characters of lowercase Crockford base32, assigned by the index.

```
^[0-9a-hjkmnp-tv-z]{16}$
```

An `opid` is opaque. It encodes no brand, category, country or time, and must never be parsed. It is never reused and never deleted; when two entities are merged, the losing `opid` keeps resolving and redirects to the surviving one.

Entities have one of three kinds:

| kind | meaning |
| --- | --- |
| `family` | the product as people talk about it: "Acme Trail Jacket" |
| `variant` | one combination of variant axes within a family: navy, size M |
| `item` | one trade item: the thing that carries a GTIN, in a given packaging, for given markets |

A barcode is not a product. GTIN, MPN, ASIN, UDI-DI and every other code are identifiers that resolve to an `opid`.

## Identifiers

An identifier is a `{ scheme, value }` pair. Schemes are lowercase. Well-known schemes:

| scheme | value |
| --- | --- |
| `gtin` | GTIN-8, -12, -13 or -14, digits only. The index validates the check digit and stores GTIN-14, left-padded with zeros. |
| `mpn` | Manufacturer part number. Scoped to the record's `brand`. |
| `sku` | Publisher's own stock code. Scoped to the source. |
| `asin` | Amazon Standard Identification Number. |
| `udi-di` | Device identifier part of a medical device UDI. |
| `eprel` | EU EPREL registration number. |
| `fcc-id` | FCC equipment authorization ID. |

Unknown schemes are accepted and stored.

## Publishing

A source is a domain. Whoever controls the domain controls what is published under it; serving the files over HTTPS from that domain is the proof.

1. Serve a discovery document at `https://<domain>/.well-known/prodid.json` ([schema](schemas/org.prodid.feed.json), [example](examples/prodid.json)).
2. It lists one or more feeds on the same domain. A feed is NDJSON: one [`org.prodid.item`](schemas/org.prodid.item.json) record per line ([example](examples/item.jacket.json)).
3. The index fetches the discovery document and the feeds, validates every line, and records each field as a claim made by that domain.

Publishers send flat items. `group` ties the variants of one product together, the way `item_group_id` does in a Google Merchant feed; the index builds families and variants from it. Publishers never send an `opid`.

`key` is the record's stable name within the feed. Publishing a record with an existing key replaces the previous one. A key that disappears from the feed marks the source's claims about it as withdrawn; the entity and its `opid` remain.

Publishers without their own domain are hosted at `<slug>.prodid.org`, served by the same mechanism, and can move to their own domain later without changing any `opid`.

## Claims

The index never stores a bare field. It stores claims:

```
(opid, property, value, source, seen_at, evidence)
```

Two sources may disagree about the same property; both claims are kept, each attributed to its source. Matching decisions, the statement that two records describe the same entity, are claims too, and can be reversed.

## Resolving

| URL | resolves |
| --- | --- |
| `https://prodid.org/id/{opid}` | an entity by `opid` |
| `https://prodid.org/01/{gtin}` | an item by GTIN, in GS1 Digital Link syntax |

Both answer `application/json` when asked for it and an HTML page otherwise. v0 resolves on the GTIN alone; further GS1 Digital Link path segments such as `/10/{lot}` and `/21/{serial}` are accepted and ignored.

## Media

Media is ingested only when the record states its license as an SPDX identifier. The index fetches the file, stores it under its SHA-256, and serves it from:

```
https://media.prodid.org/sha256/{hex}
```

The claim keeps the hash, the original URL, the license, the source and the fetch time. Files are immutable. A hash on the takedown list is deleted and cannot be stored again.

## Licensing

This specification and the schemas are [CC0](LICENSE). `opid`s and identifier mappings published by prodid.org are CC0. Every other claim carries the license of its source.

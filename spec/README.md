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
| `sku` | Publisher's own stock code. Scoped to the source itself, not to its name, so it survives the source gaining or changing a domain. |
| `asin` | Amazon Standard Identification Number. |
| `udi-di` | Device identifier part of a medical device UDI. |
| `eprel` | EU EPREL registration number. |
| `fcc-id` | FCC equipment authorization ID. |

Unknown schemes are accepted and stored.

## Publishing

A source's identity is a domain it controls. Hosting is separate from identity: where the documents are served is delegable and can change without changing the identity or any `opid`. A source is permanent; it lapses, it is never deleted.

### Discovery

Discovery runs from scratch on every crawl, DNS included. Nothing about the path to a source is remembered between crawls, so a delegation that is removed is gone at the next crawl.

1. **DNS TXT at `_prodid.<domain>`.** If a `v=prodid0` record exists it is followed exclusively, even when it names the domain itself.

   ```
   _prodid.acme.example. IN TXT "v=prodid0; feed=https://acme.prodid.org/.well-known/prodid.json"
   ```

   The document fetched from `<host>` must carry `"domain": "<domain>"`, unless `<host>` is `<domain>` itself. DNS says where the document is, the document says which domain it speaks for; both must agree.

2. **`https://<domain>/.well-known/prodid.json`**, consulted only when no `v=prodid0` record exists at `_prodid.<domain>`.

DNS comes first because it is the stronger proof: whoever can put a file on a host is not always who owns the domain, and the owner must be able to override that. There is no fallback from step 1 to step 2: a delegation that is present but does not answer is a failed discovery, not an invitation to look elsewhere.

A step **succeeds** when all of this holds:

- HTTP 200, after at most the one permitted redirect;
- the body parses as JSON;
- it validates against [`org.prodid.feed`](schemas/org.prodid.feed.json);
- its `domain` is absent, or equal to the domain being discovered.

Anything else is not an answer: a 404, a 200 carrying an HTML fallback page, a single-page app that answers every path, a document for another domain.

A document whose `domain` names another domain, and to which that domain does not delegate, speaks for nobody. It is ignored, and nothing is published under either domain because of it.

### The `_prodid` TXT record

An RR at `_prodid.<domain>` is a **prodid record** when its value, after concatenation and leading whitespace, begins with the tag `v` whose value is `prodid0`, followed by the end of the value, whitespace or `;`. Every other TXT RR at that name — SPF, verification tokens, an unknown `v=` version — is ignored.

| prodid records at the name | outcome |
| --- | --- |
| none | no delegation; discovery continues with `.well-known` on the domain |
| exactly one | it is followed exclusively; if it is malformed, discovery fails |
| more than one | an error: discovery fails, it is not a choice |

The character-strings of one RR are concatenated in order, with no separator, before parsing. The concatenated value is at most 512 bytes.

```abnf
record    = *WSP version *( sep tag ) [ sep ] *WSP
version   = %s"v" *WSP "=" *WSP %s"prodid0"
sep       = *WSP ";" *WSP
tag       = name *WSP "=" *WSP value
name      = LOWER *( LOWER / DIGIT / "-" )
value     = *VALCHAR
LOWER     = %x61-7A
VALCHAR   = %x21-3A / %x3C-7E   ; printable, no space, no ";"
WSP       = SP / HTAB
```

The grammar is necessary, not sufficient. In addition:

- `v=prodid0` is the first tag.
- Tag names are lowercase. A tag name that appears more than once makes the record malformed.
- Unknown tags are ignored; a later version may define more.
- `feed` is required. A prodid record without it is malformed.
- `feed` is exactly one delegation target and nothing else:

  ```abnf
  feed-value = %s"https://" host %s"/.well-known/prodid.json"
  host       = 1*( label "." ) tld
  label      = alnum [ *61( alnum / "-" ) alnum ]
  tld        = LOWER [ *61( alnum / "-" ) alnum ]
  alnum      = LOWER / DIGIT
  ```

  The path is fixed. No port, no query, no fragment, no userinfo, no uppercase, and never an IP literal — the last label of `host` starts with a letter, which also keeps punycode names such as `acme.xn--p1ai` working.

Valid:

```
v=prodid0; feed=https://acme.prodid.org/.well-known/prodid.json
v=prodid0;feed=https://acme.prodid.org/.well-known/prodid.json
  v=prodid0 ;  feed = https://acme.prodid.org/.well-known/prodid.json
v=prodid0; feed=https://acme.prodid.org/.well-known/prodid.json;
v=prodid0; feed=https://acme.prodid.org/.well-known/prodid.json; contact=data@acme.example
```

Malformed, so discovery fails:

```
v=prodid0
v=prodid0; feed=https://acme.prodid.org/prodid.json
v=prodid0; feed=https://acme.prodid.org:8443/.well-known/prodid.json
v=prodid0; feed=http://acme.prodid.org/.well-known/prodid.json
v=prodid0; feed=https://192.0.2.10/.well-known/prodid.json
v=prodid0; Feed=https://acme.prodid.org/.well-known/prodid.json
v=prodid0; feed=https://a.example/.well-known/prodid.json; feed=https://b.example/.well-known/prodid.json
```

Not a prodid record, so ignored:

```
feed=https://acme.prodid.org/.well-known/prodid.json; v=prodid0
v=prodid1; feed=https://acme.prodid.org/.well-known/prodid.json
```

Machine-readable vectors, one file per case: [`fixtures/txt/`](fixtures/txt).

### Feeds

The discovery document ([schema](schemas/org.prodid.feed.json), [example](examples/prodid.json), [delegated example](examples/prodid.delegated.json)) lists the feeds, each served from the same host as the document itself. A document listing a feed on any other host is rejected whole: no feed from it is fetched, and the crawl is a definite negative. Serving feeds from a separate CDN hostname is not supported in v0.

A feed is NDJSON: one [`org.prodid.item`](schemas/org.prodid.item.json) record per line ([one record](examples/item.jacket.json), [a feed](examples/items.ndjson)). The index validates every line and records each field as a claim made by the source domain. A line that is over the cap below, does not parse or does not validate is skipped and logged; a feed with skipped lines updates the records it did carry but withdraws nothing, so one bad line cannot retire a catalogue.

### Three ways to publish

All three produce the same records.

| who | how | identity |
| --- | --- | --- |
| a brand that can serve files, or a platform (e-commerce SaaS, ERP, PIM) publishing for every merchant it hosts | serve `.well-known/prodid.json` on the merchant's domain, with no `_prodid` TXT record, or one naming that same domain | the domain |
| a manufacturer with a domain it cannot serve files from | publish at `<slug>.prodid.org` and add one `_prodid.<domain>` TXT record naming that host | the domain |
| a manufacturer with no domain | publish at `<slug>.prodid.org` | `<slug>.prodid.org` |

A stray `_prodid` record wins over a file on the domain, so a domain that serves its own document must not delegate elsewhere.

Sources that are not the brand owner — retailers, registries, open datasets, contributors — publish the same way. Their claims are attributed to them and never overwrite anyone else's.

### Trust

Trust is a property of the source, not of a claim.

| trust | meaning |
| --- | --- |
| `authoritative` | domain control proven and ownership of the brand confirmed |
| `verified` | domain control proven, by the TXT record or by the domain serving the document |
| `unverified` | hosted slug with no domain, dataset import, or community contribution |

### Crawling

There is no publishing API key and no account is needed to be indexed:

```
POST https://prodid.org/ping
Content-Type: application/json

{"domain": "acme.example"}
```

A ping asks the index to run discovery for that domain now. It grants the caller no say over content, but it does make the index issue DNS queries and HTTP fetches on the caller's word, so the crawler is built as if every ping were hostile.

| response | meaning |
| --- | --- |
| `202` `{"status":"accepted"}` | the domain is queued for discovery |
| `429` `{"status":"rate_limited"}`, with `Retry-After` | a limit below was reached |
| `400` `{"status":"invalid_domain"}` | the body is not a JSON object with one `domain`, or `domain` is not a hostname of the form the `domain` property takes |

That is the whole vocabulary. A ping never reports whether the domain is known, whether anything was found, what was fetched or what changed; the answer is the same for a domain that publishes and one that does not. Crawl results reach the public only as the source's own record.

Fetch rules, for pinged and scheduled crawls alike:

- `https` only, on the default port;
- public DNS names that resolve to public addresses; never an IP literal, and a name that resolves only to private, loopback, link-local or unique-local addresses is not fetched;
- at most one redirect, and only `<domain>` → `www.<domain>` with the same scheme and path; any other redirect is not followed;
- a delegation target is always exactly `https://<host>/.well-known/prodid.json`, and feeds are always on the document's own host, so neither a TXT record nor a document can aim the crawler at an arbitrary URL.

Caps:

| what | cap |
| --- | --- |
| DNS TXT lookup | 5 s |
| connect, TLS and first byte | 10 s |
| discovery document | 1 MiB, complete within 30 s |
| feeds listed in one document | 100 |
| one feed file | 256 MiB, complete within 10 min |
| one feed line | 64 KiB |

Rate limits:

| what | limit |
| --- | --- |
| accepted pings for one domain | 1 per 10 minutes |
| accepted pings for one registrable domain, across its subdomains | 10 per hour |
| fetches of one host, crawler-wide | 60 per minute |
| pings from one caller | 60 per hour |

Every known source is re-crawled on a schedule; a ping only makes the next crawl happen sooner. Conditional requests are not a shortcut past discovery: discovery reruns in full, and only once it has re-confirmed the path are the document and the feeds fetched with `If-None-Match` from the stored `ETag` and `If-Modified-Since` from the stored `Last-Modified`. A `304` then means that file has not changed. Publishers should serve `ETag` or `Last-Modified` on discovery documents and feeds.

### Lapse

A source whose discovery stops succeeding is **lapsed**, not deleted.

A **definite negative** is discovery answering that this domain no longer publishes: the name does not exist, more than one prodid record, a malformed prodid record, a fetch that returns a status other than 200, 429 and 5xx, a body that is not JSON or does not validate, a `domain` that does not agree, or a document listing a feed off its host. It sets the lapse, with its timestamp, and readers see it.

Everything else is a **transport failure** — DNS timeout or SERVFAIL, connection or TLS failure, 429, 5xx, a cap or a timeout reached. It changes nothing at all: no lapse, no withdrawal, retried on the next schedule.

While a source is lapsed it makes no new claims and its existing claims stay readable and marked. After 30 days of continuous lapse its active claims are withdrawn; they remain as history. Any successful discovery clears the lapse.

Feeds are outside this: lapse is decided by discovery alone. A feed that fails to fetch withdraws nothing and lapses nobody.

### Identity continuity

A source is permanent and keeps its identifiers when its name changes. `sku` is scoped to the source itself, not to its name.

A publisher that starts at `<slug>.prodid.org` and later adds a `_prodid.<domain>` record naming that same host becomes `<domain>` at the first crawl that confirms the delegation: the same source, the same records, the same `opid`s, with trust rising from `unverified` to `verified`. The hosted publisher writes `domain` into the served document only once it has seen the TXT record itself; until then the slug publishes under its own unverified identity, because a document naming a domain that does not delegate to it speaks for nobody.

A domain that changes hands is a new controller of the same identity. prodid does not assert that a source is the same organization over time; the crawl log and the timestamp on every claim are the record of who said what, and when.

### Records

Publishers send flat items. `group` ties the variants of one product together, the way `item_group_id` does in a Google Merchant feed; the index builds families and variants from it. Publishers never send an `opid`.

`key` is the record's stable name within the feed. Publishing a record with an existing key replaces the previous one. A key that disappears from a feed that was fetched whole marks the source's claims about it as withdrawn; the entity and its `opid` remain.

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

## Conformance

`bun run check` in this directory validates every example and fixture. Three sets, all machine-readable:

| path | what it holds |
| --- | --- |
| [`fixtures/valid/`](fixtures/valid) | records that must validate |
| [`fixtures/invalid/`](fixtures/invalid) | records that must be rejected, each for one defect |
| [`fixtures/txt/`](fixtures/txt) | `_prodid` TXT record values |

Every file in `fixtures/invalid/` has an entry in [`fixtures/expected.json`](fixtures/expected.json) naming the instance path and the schema keyword that must reject it, so a fixture that fails for a new and unrelated reason is a failure, not a pass.

A TXT vector is `{ "value": [...], "valid": true|false, "feed": "..." }`, where `value` is the RR's character-strings in order. `valid` is whether the record yields a delegation; `feed` is the target it yields, and is present exactly when `valid` is true. A vector that yields no delegation is either ignored or malformed, which the rules above decide and the vector does not carry.

## Licensing

This specification and the schemas are [CC0](LICENSE). `opid`s and identifier mappings published by prodid.org are CC0. Every other claim carries the license of its source.

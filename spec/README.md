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
| `rcn` | A GS1 restricted circulation number. Not globally unique, so it is scoped to the source, like `sku`. The index assigns this scheme; publishers write `gtin`. |
| `mpn` | Manufacturer part number. Scoped to the normalized `brand` of the record. |
| `sku` | Publisher's own stock code. Scoped to the source itself, not to its name, so it survives the source gaining or changing a domain. |
| `asin` | Amazon Standard Identification Number. |
| `udi-di` | Device identifier part of a medical device UDI. |
| `eprel` | EU EPREL registration number. |
| `fcc-id` | FCC equipment authorization ID. |

Unknown schemes are accepted and stored.

`mpn`, `sku` and `rcn` are the scoped schemes: a value of one of them means nothing without the scope it belongs to, so a reader is always given both. The scope a reader sees is the normalized brand for `mpn` and the source's current name for `sku` and `rcn`. Every other scheme is global and carries no scope at all.

### Which GTINs are identifiers

A correct check digit is not enough to make a number a global identifier.

- **All zeros is not a GTIN**, at any length. Catalogues use it as a "no barcode" placeholder, its check digit is valid, and taking it at face value would merge every product that carries it into one entity. A record whose `gtin` is all zeros is invalid, like a record with a wrong check digit.
- **Restricted circulation numbers are not global.** GS1 reserves ranges for numbers whose meaning is local to a company or a region, so the same value means different things at two sources. The index stores them under the scheme `rcn`, scoped to the source, and never merges two sources on one. `/01/{gtin}` answers a restricted number with a problem response instead of resolving it.

Classification reads the normalized 14-digit form, never the spelling: the index stores only that form, so the same number has to classify the same way however it was written. A 14-digit form that begins with six zeros is a GTIN-8 — GS1 leaves the GTIN-13 prefixes `0000001`–`0000099` unused to avoid exactly this collision — so the GTIN-8 rule governs it whether the publisher wrote 8, 13 or 14 digits.

| the normalized 14-digit form | restricted when |
| --- | --- |
| begins with six zeros, so the number is a GTIN-8 | the seventh digit is `0` or `2` (GS1-8 prefixes `000`–`099` and `200`–`299`) |
| anything else | the 13 digits after the indicator digit begin with `02`, `04` or `20`–`29` |

`01234565` is a restricted GTIN-8; written out as `0000001234565` or `00000001234565` it is the same restricted number, which a rule keyed on the written length would miss. The GS1 prefix `0000000` needs no row of its own: a 13-digit number beginning with it has eight leading zeros once normalized, so the first row reads it as a GTIN-8 beginning with `0`, which is restricted as well. The two readings agree, which is the point.

Verified against the GS1 General Specifications, figures 1.4.2-1, 1.4.3-1 and 1.4.5-1: GS1 Prefix `02` and `20`–`29` are "used to issue Restricted Circulation Numbers within a geographic region", `04` and `0000000` "within a company", and the GS1-8 Prefix ranges `000`–`099` and `200`–`299` likewise. `05` is reserved for future use, not restricted, and is treated as an ordinary GTIN.

Vectors: [`fixtures/gtin/`](fixtures/gtin), one file per case as `{ "value": "...", "verdict": "gtin" | "rcn" | "invalid" }`.

### Brand normalization

`mpn` is scoped to the brand, and a brand written two ways is two scopes, so the brand is normalized before it is used as a scope. The normalized form is, in order:

1. Unicode NFKC;
2. lowercase, locale-independent;
3. `ı` (U+0131) becomes `i`, and every combining dot above (U+0307) in the run directly following an `i` is removed — the whole run, not one;
4. runs of whitespace collapse to one space, and the ends are trimmed.

Step 3 exists because locale-independent lowercasing turns `İ` (U+0130) into `i` + U+0307: without it `ARÇELİK` and `Arçelik` are two brands, and `IŞIK`, `Işık` and `ışık` are three — in this project's first market.

Normalizing a normalized brand must return it unchanged. That is why step 3 takes the whole run: removing one dot at a time would make `İ̇lik` land on `i̇lik` and only then on `ilik`, and since the normalized brand is the `mpn` scope, a second pass would quietly move every `mpn` that brand ever published.

| brand | normalized |
| --- | --- |
| `Acme` | `acme` |
| `Ａｃｍｅ` | `acme` |
| `Acme  Tekstil` | `acme tekstil` |
| `ARÇELİK`, `Arçelik` | `arçelik` |
| `IŞIK`, `Işık`, `ışık` | `işik` |
| `İ̇lik` (U+0130 U+0307) | `ilik` |

The normalized form is what `scope` carries in a resolver response; the brand as the publisher wrote it stays in the `brand` claim. Vectors: [`fixtures/brand/`](fixtures/brand), as `{ "input": "...", "normalized": "..." }`.

## Publishing

A source's identity is a domain it controls. Hosting is separate from identity: where the documents are served is delegable and can change without changing the identity or any `opid`. A source is permanent; it lapses, it is never deleted.

### Discovery

Discovery runs from scratch on every crawl, DNS included. Nothing about the path to a source is remembered between crawls, so a delegation that is removed is gone at the next crawl.

1. **DNS TXT at `_prodid.<domain>`.** If a `v=prodid0` record exists it is followed exclusively, even when it names the domain itself. The record names a host; the document is always `https://<host>/.well-known/prodid.json`.

   ```
   _prodid.acme.example. IN TXT "v=prodid0; host=acme.prodid.org"
   ```

2. **`https://<domain>/.well-known/prodid.json`**, used only when no `v=prodid0` record exists at `_prodid.<domain>`.

DNS comes first because it is the stronger proof: whoever can put a file on a host is not always who owns the domain, and the owner must be able to override that. There is no fallback from step 1 to step 2. A record that exists but is malformed, over-long or duplicated ends discovery; it never sends the crawler to the weaker path.

A step **succeeds** when all of this holds:

- HTTP 200, after at most the one permitted redirect;
- a JSON content type: `application/json`, or any `application/…+json`;
- a body that validates against [`org.prodid.feed`](schemas/org.prodid.feed.json);
- the `domain` rule below.

Anything else is not an answer: a 404, a 200 carrying an HTML fallback page, a single-page app that answers every path, a document served as `text/html`.

**The `domain` rule.** A document reached through a TXT record whose `<host>` is not the domain itself **must** carry `"domain": "<domain>"`, equal to the domain being discovered. A delegated document without it is rejected — absence is never taken as consent. `domain` may be absent only when the domain serves its own document, in step 2 or through a record naming the domain itself; when it is present there it must still equal that domain. A `<domain>` → `www.<domain>` redirect is inside step 2 and is not delegation, so it does not make `domain` required.

A document whose `domain` names another domain, and to which that domain does not delegate, speaks for nobody. It is ignored, and nothing is published under either domain because of it.

### The `_prodid` TXT record

An RR at `_prodid.<domain>` is a **prodid record** when its value, after concatenation, is a tag list whose first tag is `v` with the value `prodid0`. Every other TXT RR at that name — verification tokens, `v=spf1`, a `v=` version this spec does not define — is ignored.

| prodid records at the name | outcome |
| --- | --- |
| none | no delegation; discovery continues with `.well-known` on the domain |
| exactly one | it is followed exclusively; if it is malformed or over-long, discovery fails |
| more than one | an error: discovery fails, it is not a choice |

The character-strings of one RR are concatenated in order, with no separator, before parsing. The concatenated value is at most 512 bytes; a prodid record over that is malformed, not ignored.

```abnf
record  = *WSP version *( sep tag ) [ sep ] *WSP
version = %s"v" *WSP "=" *WSP %s"prodid0"
sep     = *WSP ";" *WSP
tag     = name *WSP "=" *WSP value
name    = LOWER *( LOWER / DIGIT / "-" )
value   = *VALCHAR
LOWER   = %x61-7A
DIGIT   = %x30-39
VALCHAR = %x21-3A / %x3C-7E   ; printable, no space, no ";"
WSP     = SP / HTAB
```

The grammar is necessary, not sufficient. In addition:

- `v=prodid0` is the first tag. A value whose first tag is anything else is not a prodid record, ignored rather than rejected.
- Tag names are lowercase. A tag name that appears more than once makes the record malformed.
- Unknown tags are ignored; a later version may define more.
- `host` is required. A prodid record without it is malformed.
- `host` is normalized before it is read: lowercased, and one trailing dot removed. DNS names are case-insensitive and the absolute form with the trailing dot is what many DNS panels write, and under the lapse rule a capital letter would otherwise cost a publisher its catalogue. `ACME.Prodid.org.` and `acme.prodid.org` are the same host.
- The normalized value must then satisfy the same rule as the document's `domain` field: at least two labels, at most 253 bytes in total, the last label starting with a letter, and therefore never an IP literal. It is ASCII: punycode A-labels such as `acme.xn--p1ai` are hostnames like any other, a U-label such as `açme.example` is not, and a second trailing dot is not.
- The `domain` field inside the document stays strictly lowercase, with no trailing dot. Software writes it; a DNS panel does not.

Because the record names a host and the path is fixed, there is nothing in it that can express a port, a path, a query, a fragment, userinfo or a scheme; a value carrying any of them is simply not a hostname, so the record is malformed.

Delegations, every one of them to `acme.prodid.org`:

```
v=prodid0; host=acme.prodid.org
v=prodid0;host=acme.prodid.org
  v=prodid0 ;  host = acme.prodid.org
v=prodid0; host=acme.prodid.org;
v=prodid0; host=acme.prodid.org; contact=data@acme.example
v=prodid0; host=ACME.prodid.org.
```

The last one is the normalization at work: the case and the trailing dot are how a DNS panel writes the same name.

Malformed, so discovery fails:

```
v=prodid0
v=prodid0; host=acme.prodid.org; host=evil.example
v=prodid0; Host=acme.prodid.org
v=prodid0; host=açme.example
v=prodid0; host=acme.prodid.org..
v=prodid0; host=192.0.2.10
v=prodid0; host=acme.prodid.org:8443
v=prodid0; host=https://acme.prodid.org
v=prodid0; host=acme.prodid.org/.well-known/prodid.json
```

Not a prodid record, so ignored:

```
host=acme.prodid.org; v=prodid0
v=prodid1; host=acme.prodid.org
v=spf1 include:_spf.example ~all
```

Machine-readable vectors, one file per case: [`fixtures/txt/`](fixtures/txt).

### Feeds

The discovery document ([schema](schemas/org.prodid.feed.json), [example](examples/prodid.json), [delegated example](examples/prodid.delegated.json)) lists the feeds, each served from the same host as the document itself. Both hosts are normalized the same way as a delegation's `host` before they are compared. A document listing a feed on any other host, or listing more than 100 feeds, is rejected whole: no feed from it is fetched, and discovery ends with no acceptable document. Serving feeds from a separate CDN hostname is not supported in v0.

A feed is NDJSON: one [`org.prodid.item`](schemas/org.prodid.item.json) record per line ([one record](examples/item.jacket.json), [a feed](examples/items.ndjson)). The index validates every line and records each field as a claim made by the source domain.

A line that is over the size cap, unparseable or invalid is skipped and counted. Because a skipped line's key is unknown, a feed with skipped lines withdraws nothing — but only for seven days. After seven days of crawls that keep skipping lines, absent keys are withdrawn as usual: a broken line may delay withdrawal, it may not disable it. The count is public in the source's status, so this never happens silently.

A feed that cannot be fetched at all is a different failure and has its own bound: the crawl becomes a [transport failure](#lapse), which lapses the source after seven days of it.

**A feed the document stops listing is retired.** When a crawl reads an acceptable document that no longer names a feed URL, that feed's live records are withdrawn — exactly as if every one of its keys had disappeared — and the URL is not fetched again. Listing it again later brings it back as an ordinary feed, read from scratch. A retired feed is never a failed feed: it was not fetched, so it cannot have failed, and it never counts in `feeds_failed`.

Retiring withdraws at once and the seven-day grace does not apply to it. The grace exists for a feed that is still listed and whose lines the crawler could not read, where the publisher may not know anything is wrong; removing a URL from the document is the publisher saying so on purpose, and the index takes it at its word even if that feed's last crawl skipped lines.

A `304` on the discovery document retires nothing. The document has not changed, so the list in it has not changed; only a document that was read and parsed can retire a feed.

Three rules make a record invalid that the schemas cannot express, and a record that breaks any of them is skipped like any other:

- **Every string must be storable.** No U+0000, and no lone surrogate: the string has to be well-formed Unicode. [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) makes a lone surrogate an error when canonicalizing, and the index's store rejects both, so a record carrying one cannot be kept at all — and one such line must cost its own line, not the whole ingest.
- **A `gtin` identifier must be a GTIN**: 8, 12, 13 or 14 digits, a correct check digit, and not all zeros. [Which GTINs are identifiers](#which-gtins-are-identifiers) has the rest, including restricted numbers, which are stored rather than rejected.
- **A record must carry at least one identifier the index can store.** An identifier value is not blank and is not padded — the schema requires at least one character that is not whitespace, and no whitespace at either end — and an `mpn` needs the record's `brand` to normalize to something, because that is the scope it is unique within. A record with nothing usable left identifies nothing, so matching it would mint a fresh entity on every single crawl; it is skipped instead.

[`fixtures/ndjson/`](fixtures/ndjson) is a feed with one of each defect and the line numbers that must be skipped.

### Three ways to publish

All three produce the same records.

| who | how | identity |
| --- | --- | --- |
| a brand that can serve files, or a platform (e-commerce SaaS, ERP, PIM) publishing for every merchant it hosts | serve `.well-known/prodid.json` on the merchant's domain, and publish `v=prodid0; host=<domain>` at `_prodid.<domain>` | the domain |
| a manufacturer with a domain it cannot serve files from | publish at `<slug>.prodid.org` and add one `_prodid.<domain>` record naming that host | the domain |
| a manufacturer with no domain | publish at `<slug>.prodid.org` | `<slug>.prodid.org` |

A prodid record wins over a file on the domain, so a domain that serves its own document must not delegate elsewhere — and, as [Security considerations](#security-considerations) explains, should say so with a record of its own.

A name under the hosting zone is a case of its own: `<slug>.prodid.org` is always a `hosted` source and always `unverified`, however discovery reached it. Pinging a slug runs discovery like any other name, and the document it finds there is served from prodid.org's domain, so it proves control of a slug and nothing more. Only a domain's own `_prodid` record, naming that host, turns the slug into a verified source.

Sources that are not the brand owner — retailers, registries, open datasets, contributors — publish the same way. Their claims are attributed to them and never overwrite anyone else's.

### Trust

Trust is a property of the source, not of a claim.

| trust | meaning |
| --- | --- |
| `authoritative` | domain control proven and ownership of the brand confirmed |
| `verified` | control of a **domain** proven: its `_prodid` record names the host that serves the document, or the domain itself served it |
| `unverified` | hosted slug with no domain, dataset import, or community contribution |

Only a source whose identity is a domain can be more than `unverified`. A `<slug>.prodid.org` host is prodid.org's domain, not the publisher's, so serving a document there proves nothing about the publisher: a hosted source stays `unverified` however well it publishes, until a domain's `_prodid` record names that host and the document names the domain back. That is the moment it [becomes that domain](#identity-continuity), and the same moment its trust rises.

### Crawling

There is no publishing API key and no account is needed to be indexed:

```
POST https://prodid.org/ping
Content-Type: application/json

{"domains": ["acme.example", "beta.example"]}
```

`{"domain": "acme.example"}` is the single-domain form; a request carries one form or the other, and at most 1000 domains. A ping asks the index to run discovery for those domains now. It grants the caller no say over content, but it does make the index issue DNS queries and HTTP fetches on the caller's word, so the crawler is built as if every ping were hostile.

| response | meaning |
| --- | --- |
| `202` `{"status":"accepted"}` | the request was taken |
| `429` problem `rate-limited`, with `Retry-After` | the caller is over its request budget |
| `400` problem `invalid-request` | not one of the two forms, over 1000 domains, or a name that is not a hostname |

That is the whole vocabulary, and `202` is all it says. It does not report whether a domain is known, whether anything was found, what was fetched, what changed, or whether someone else pinged it a minute ago: a domain already inside its own crawl window is folded into the schedule it already has, and the answer stays `202`. A request naming an invalid domain is rejected whole rather than per domain, so no answer varies with anything except the caller's own request. Crawl results reach the public only as the source's own [status](#a-sources-status).

Fetch rules, for pinged and scheduled crawls alike:

- `https` only, on the default port;
- public DNS names that resolve to public addresses; never an IP literal, and a name that resolves only to private, loopback, link-local or unique-local addresses is not fetched;
- at most one redirect, and only `<domain>` → `www.<domain>` with the same scheme and path; any other redirect is not followed;
- a delegation names a host and the document path is fixed, and feeds are always on the document's own host, so neither a TXT record nor a document can aim the crawler at an arbitrary URL.

Caps:

| what | cap |
| --- | --- |
| DNS TXT lookup | 5 s |
| connect, TLS and first byte | 10 s |
| discovery document | 1 MiB, complete within 30 s |
| feeds listed in one document | 100; a document listing more than that is rejected whole |
| one feed file | 256 MiB, complete within 10 min |
| one feed line | 64 KiB |
| domains in one ping request | 1000 |

Rate limits:

| what | limit |
| --- | --- |
| discovery of one domain | 1 per 10 minutes |
| first contact with domains sharing one registrable domain | 1000 per hour |
| ping requests from one caller | 60 per hour |
| fetches of one host, crawler-wide | two lanes, below |

A caller is a client address: an IPv4 /32 or an IPv6 /64.

The per-host budget has two lanes, and both grow with `v`, the number of sources currently verified at that host:

| lane | fetches per minute |
| --- | --- |
| crawls of sources already verified at the host | `max(40, v / 100)`, never above 600 |
| discovery on behalf of domains not yet verified at the host | `max(20, v / 500)`, never above 200 |

The verified lane is reserved: discovery for strangers cannot consume it, so pointing thousands of domains at a publisher's host cannot starve that publisher's own crawl. Growth is safe because `v` counts only sources whose discovery has succeeded at that host, which means a document there named them and they agreed — a host serving documents for thousands of domains has asked to be crawled. Domains an attacker points at a host it does not control never verify, so they never raise `v`, and a host nobody is verified at never gets more than the base 40 and 20. A fetch held back by either lane is deferred and rescheduled. Being deferred is not an outcome: it is not a failure, not a negative, and never a lapse.

A crawl costs one fetch for the discovery document plus one per feed the document lists. First contact is a document fetch in the unverified lane; everything after it, for that source at that host, is in the verified lane.

**A platform on its merchants' own domains.** The document for each merchant is served on that merchant's domain, so every host has its own budget and `v = 1`; nothing contends with anything. What bounds it is the ping: 100 000 domains at 1000 per request is 100 requests, and at 60 requests per hour one caller is done in **1 hour 40 minutes**. This is the topology to prefer where a platform can choose, and it is also the only one where a merchant can leave with its data path intact.

**A platform delegating 100 000 merchants to one host.** Every first contact is in that host's unverified lane. It starts at the base 20 per minute and accelerates as merchants verify: 20/min until `v` reaches 10 000 (500 minutes, **8 hours**), then `v/500` per minute, which is exponential with a 500-minute time constant and covers the remaining 90 000 in `500 · ln 10` ≈ 1150 minutes (**19 hours**) — about **27 hours** in all, against 83 hours at a flat 20 per minute. After that the host is at `v = 100 000`, so the verified lane is at its 600-per-minute cap: a full re-crawl is 100 000 document fetches in under 3 hours, or about 5 and a half with one feed each, against 42 hours at a flat 40. The first day is the price of one host; per-merchant hosts do not pay it.

**An attacker aiming the crawler at a victim host.** Nothing the attacker does raises `v` at a host it does not control, so the victim's unverified lane stays at the base 20 fetches per minute: 1200 an hour, at most 20 MiB a minute, no matter how many domains, callers or zones are involved — and the victim's own crawls keep their verified lane throughout. The attacker's own ceiling is the same 100 requests per 1 hour 40 minutes, each ~24 KB buying at most 1000 DNS lookups and 1000 document fetches of at most 1 MiB. Spreading the load instead of concentrating it runs into the other two limits: 1000 new names per hour per registrable domain, 60 000 domains per hour per caller, and nothing at all that the domains themselves do not publish.

Every known source is re-crawled on a schedule; a ping only makes the next crawl happen sooner. Conditional requests are not a shortcut past discovery: discovery reruns in full, DNS included, and only once it has re-confirmed the path are the document and the feeds fetched with `If-None-Match` from the stored `ETag` and `If-Modified-Since` from the stored `Last-Modified`. A `304` then means that file has not changed. Publishers should serve `ETag` or `Last-Modified` on discovery documents and feeds.

### Lapse

A source whose discovery stops succeeding is **lapsed**, not deleted.

A crawl **succeeds** only when everything the document lists was read: an acceptable document, and every feed in it answered `200` or `304`.

A **definite negative** is discovery ending with no acceptable document, whether none was found at all or one was fetched and refused: no prodid record and no acceptable document on the domain; a prodid record that is malformed, over-long or duplicated; or a document that is rejected — not 200, not JSON, not valid, not agreeing about `domain`, or listing a feed off its host. It sets the lapse at once, with its timestamp, and readers see it.

A **transport failure** is a crawl that could not be completed: DNS timeout or SERVFAIL, connection or TLS failure, 429, 5xx, a cap or a timeout reached — on the document **or on any feed it lists**. One changes nothing. Seven consecutive days in which every attempt ends this way set the lapse too, so serving errors forever is not a way to freeze claims where they are.

**That benefit of the doubt belongs to a host, not to a source.** It applies only at a host this source has already been verified at. At a host it has never been verified at, any failure — a timeout or a 5xx included — is a definite negative and lapses the source at once. Otherwise a verified source could re-point its `_prodid` record at a host it does not control and read back, from its own `outcome` and from whether its lapse starts today or in a week, whether that host is up. A publisher moving hosts loses nothing to this: the first crawl that succeeds at the new host clears everything, and even a lapse is recoverable for the 30 days before claims are withdrawn.

A feed that cannot be read is therefore not a free pass. The feeds that did answer are still ingested, and no feed withdraws anything on a crawl that failed — but the crawl counts as a transport failure and `feeds_failed` says so in the source's status, so a valid document in front of a permanently broken feed lapses on the same seven-day clock as a domain that stopped answering at all. Nothing can hold a source's claims still and healthy-looking for ever.

While a source is lapsed it makes no new claims, its existing claims stay readable and stay marked, and its `publisher.contact` is notified. A crawl of a lapsed source writes nothing until it has succeeded in full; only then is the lapse cleared and the source ingested again. After 30 days of continuous lapse its records and their active claims are withdrawn together; they remain as history. Those 30 days are the window in which a publisher can notice and put the record, the document or the feed back.

Recovery does not depend on anything changing. Once discovery succeeds again, everything the source publishes at that moment is asserted again, whether or not a single byte moved: a publisher that comes back serving the identical document and the identical feed gets its catalogue back. Conditional requests are an optimization the index gives up whenever it has nothing live from a source, never a reason for a returning publisher to stay withdrawn.

Claims re-asserted after such a withdrawal are new assertions, with a new `seen_at`: for the length of the gap nobody verifiable stood behind them, and saying otherwise would date a fact to a time when it had no source. The withdrawn rows stay, so `?history=1` shows the gap.

### Identity continuity

A source is permanent and keeps its identifiers when its name changes. `sku` is scoped to the source itself, not to its name.

A publisher that starts at `<slug>.prodid.org` and later adds a `_prodid.<domain>` record naming that same host becomes `<domain>` at the first crawl that confirms the delegation: the same source, the same records, the same `opid`s, with trust rising from `unverified` to `verified`. The hosted publisher writes `domain` into the served document only once it has seen the TXT record itself; until then the slug publishes under its own unverified identity, because a document naming a domain that does not delegate to it speaks for nobody.

A domain that changes hands is a new controller of the same identity. prodid does not assert that a source is the same organization over time; the crawl log and the timestamp on every claim are the record of who said what, and when.

### Records

Publishers send flat items. `group` ties the variants of one product together, the way `item_group_id` does in a Google Merchant feed; the index builds families and variants from it. Publishers never send an `opid`.

`key` is the record's stable name within the feed. Publishing a record with an existing key replaces the previous one. A key that disappears from a feed the crawler fetched whole marks the source's claims about it as withdrawn; the entity and its `opid` remain. A feed with skipped lines withdraws nothing for seven days, and after that withdraws absent keys as usual. Dropping a feed from the discovery document withdraws every key it carried, at once and without that grace, because it is the publisher saying the whole file is gone.

## Security considerations

Write access to `_prodid.<domain>` is control of the identity, exactly as it is for DKIM or an ACME DNS-01 challenge. It must not be delegated to a vendor, and a domain whose DNS is shared is an identity that is shared.

Where no record and no document exist yet, whoever first publishes one becomes the source for that domain. That is the trust model, not a flaw in it: the index can only believe what the domain says about itself.

- **Publish a record even when you serve your own document.** `v=prodid0; host=<domain>` costs nothing and changes what an attacker with add-only DNS access can do. With no record, a record they add takes the identity over. With your record already there, a second one makes discovery fail with "more than one record": a lapse, which is visible, notified and recoverable, instead of a silent takeover.
- **Lapse is the alarm.** The index notifies `publisher.contact` when a source lapses, and the 30 days before claims are withdrawn are the recovery window. A contact address that nobody reads turns a recoverable event into a silent one.
- **A short hijack leaves a long trace.** Claims made while an attacker controlled the DNS or the host are attributed to the source and stay until they are withdrawn, and media fetched then keeps its hash. The crawl log and the claim timestamps show exactly when they arrived, which is what makes an hour of control an hour of damage rather than a permanent one.
- **A domain that changes hands** is a new controller of the same identity. Readers who care about provenance read `seen_at` and the source's status, not just the value.
- **Trust is about control, not truth.** `verified` says the index proved who serves the domain. It says nothing about whether what the domain publishes is correct, and a reader that shows a claim without its source is showing an unattributed assertion.

## Claims

The index never stores a bare field. It stores claims:

```
(opid, property, value, source, seen_at, evidence)
```

Two sources may disagree about the same property; both claims are kept, each attributed to its source. Matching decisions, the statement that two records describe the same entity, are claims too, and can be reversed.

### Property names

A published record becomes one claim per fact, under these names and no others:

| property | one claim per | value |
| --- | --- | --- |
| `brand` | record | the record's `brand` |
| `name` | record | the record's `name` |
| `category` | record | the GPC brick code |
| `markets` | market code | one ISO 3166-1 alpha-2 code |
| `media` | file | the stored media, as below |
| `variant.<axis>` | key of `variant` | that axis's value |
| `properties.<name>` | key of `properties` | that property's value |

`<axis>` and `<name>` are exactly the publisher's own keys, which [`org.prodid.item`](schemas/org.prodid.item.json) already restricts to `^[a-z][A-Za-z0-9]*$`. The two prefixes are not decoration: flattened, a publisher property called `name` or `brand` would collide with the built-in claim of the same name, and a `variant` axis would collide with a `properties` entry of the same name. There is exactly one dot, and v0 defines no other property names.

`markets` and `media` are sets, so each element is its own claim, as the table says: `["TR", "DE"]` is two `markets` claims carrying `"TR"` and `"DE"`. Reordering the list in the feed then changes nothing, and a market added or dropped withdraws exactly one claim instead of rewriting the set.

`lang` is carried only by claims whose value is text the publisher wrote: `brand`, `name`, `variant.*`, and those `properties.*` whose value is a string or a list of strings. `category`, `markets` and `media` never carry it.

A `media` claim is the one whose value is not the publisher's raw value. The publisher writes a URL and a license; the claim carries what the index stored:

```json
{
  "property": "media",
  "value": {
    "sha256": "e3943ea26ce08ae81809e62936dc4f934fa04da6cd57bd9ab2a90b79da751c09",
    "url": "https://acme.example/img/tj2041-navy.webp",
    "media_url": "https://media.prodid.org/sha256/e3943ea26ce08ae81809e62936dc4f934fa04da6cd57bd9ab2a90b79da751c09",
    "license": "CC-BY-4.0",
    "kind": "image"
  },
  "source": { "name": "acme.example", "trust": "verified", "lapsed": false },
  "seen_at": "2026-09-14T09:12:03Z"
}
```

A reader fetches `media_url`, which is immutable and always answers the same bytes. `url` is where the source published the file, kept as provenance; it may have changed or gone since.

## Reading

### The resolver

| request | answers |
| --- | --- |
| `GET /id/{opid}` | that entity |
| `GET /01/{gtin}` | the item that GTIN identifies, with `Content-Location: /id/{opid}` |
| `GET /source/{name}` | that source's status, once it has one |

All three answer `application/json` when the request accepts it and an HTML page otherwise.

`/01/{gtin}` accepts GTIN-8, -12, -13 and -14 and answers the item itself rather than redirecting, so a QR scan costs one round trip; the `Content-Location` header gives the canonical `opid` URL. v0 resolves on the GTIN alone; further GS1 Digital Link path segments such as `/10/{lot}` and `/21/{serial}` are accepted and ignored.

An `opid` that was merged into another answers `308 Permanent Redirect` to `/id/{survivor}`, and the survivor lists it in `merged_from`. Merges are reversible, which is why the redirect is per-request and the losing `opid` keeps resolving forever.

`?history=1` adds the withdrawn claims, each carrying `withdrawn_at`. Without it, only active claims are returned.

### An entity

[Schema](schemas/org.prodid.entity.json). [Item](examples/entity.item.json), [family](examples/entity.family.json).

```json
{
  "$type": "org.prodid.entity",
  "opid": "kq7m3v9dn2hb4t5x",
  "kind": "item",
  "parents": { "family": "3n7k2q9vdfhb4mta", "variant": "9p2d4kv7mq3nbhxf" },
  "identifiers": [{ "scheme": "gtin", "value": "09506000134352" }],
  "claims": [
    {
      "property": "name",
      "value": "Trail Jacket",
      "lang": "en",
      "source": { "name": "acme.example", "trust": "verified", "lapsed": false },
      "seen_at": "2026-09-14T09:12:03Z"
    }
  ]
}
```

The response has no bare fields. There is no top-level `name` or `brand`: every value a reader sees is inside a claim that carries its `source` — the source's identity, its `trust` and whether it is lapsed — and the `seen_at` at which that source began asserting it. Two sources disagreeing produce two claims, and choosing between them is the reader's decision, made with the source in hand.

`seen_at` is when this source started asserting this value and has not stopped since, not when the fact was first published anywhere. It survives a re-crawl that finds the same value, which is the point of it; it does not survive a withdrawal. A source [lapsed](#lapse) for 30 days has its records and claims withdrawn, and what it publishes afterwards is asserted again from that day, because for the length of the gap nobody verifiable stood behind it. `?history=1` shows the withdrawn rows, so the gap is visible rather than implied.

`parents` and `children` are the hierarchy as opids: an item names its variant and its family, a variant names its family and lists its items, a family lists its variants and has no parents. An item has no children. Property names are the namespaced ones above, so a reader can tell `name` from `properties.name` without guessing.

An identifier is global or scoped, never ambiguously either. `gtin` is the normalized 14-digit form, never all zeros, and carries no scope; `mpn`, `sku` and `rcn` carry a non-empty `scope` — the normalized brand, or the source's name — and nothing else carries one at all. That is what keeps a restricted number from reading as a global one, which is the whole reason `rcn` exists.

Three rules hold that the schema cannot state, because each compares two values in the same document:

- no `opid` appears in its own `parents`, `children` or `merged_from`;
- `withdrawn_at` is never before `seen_at`;
- a `media` claim's `media_url` addresses its own `sha256`.

The conformance harness checks all three.

### A source's status

[Schema](schemas/org.prodid.source.json). [Example](examples/source.json).

```json
{
  "$type": "org.prodid.source",
  "name": "acme.example",
  "kind": "domain",
  "trust": "verified",
  "verified_by": "dns-txt",
  "verified_at": "2026-09-14T09:12:03Z",
  "lapsed": false,
  "license": "CC0-1.0",
  "last_crawl": {
    "at": "2026-09-19T06:00:11Z",
    "via": "dns-txt",
    "document_url": "https://acme.prodid.org/.well-known/prodid.json",
    "outcome": "success",
    "http_status": 200,
    "records_seen": 3,
    "records_changed": 1,
    "lines_skipped": 0,
    "feeds_failed": 0,
    "media_failed": 0
  }
}
```

This is how a publisher sees that something is wrong: the outcome of the last crawl, how many lines were skipped, how many feeds could not be read, and whether the source is lapsed and since when. `trust` above `unverified` exists exactly when the proof does, so `verified_by` and `verified_at` are present together or not at all, and only a source whose identity is a domain can be more than `unverified`. `records_changed` is never more than `records_seen`, which is a rule the schema cannot state.

Two things keep this page from becoming a probe:

- **A domain becomes a source at its first successful discovery, not before.** Until then there is no row, and `/source/{name}` answers `404` — the same `404` as a name nobody has ever pinged. Pinging a domain therefore tells the caller nothing, because it creates nothing to read.
- **`http_status` and `document_url` are shown only for the host the source was last verified at.** Otherwise anyone could register `evil.example`, point `_prodid` at a host they do not control, ping it, and read back through this page how that host answers — and the crawler's egress is not theirs, so the answer would see past address, network and geography blocks that the host set up on purpose. The assurance is not only that this page says nothing about other callers; it is that it says nothing about any host but the one this source is published from.

It never reports who asked for a crawl, how often anyone asks, or the crawler's internal error text.

### Errors

Every error answers `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)). The status says what kind of failure it is; the `type` says why:

```json
{ "type": "https://prodid.org/problem/unknown-opid", "title": "No entity with that opid", "status": 404 }
```

| type | status | when |
| --- | --- | --- |
| `…/problem/unknown-opid` | `404` | no entity with that `opid` |
| `…/problem/unknown-gtin` | `404` | a well-formed GTIN that resolves to nothing |
| `…/problem/restricted-gtin` | `404` | a GS1 restricted circulation number: well-formed, but it identifies nothing globally, so there is no record to answer with |
| `…/problem/unknown-source` | `404` | no source with that name, including a domain whose discovery has never succeeded |
| `…/problem/not-found` | `404` | nothing is served at that path |
| `…/problem/invalid-gtin` | `400` | not a GTIN: wrong length, a bad check digit, or all zeros |
| `…/problem/invalid-request` | `400` | a malformed request, including a bad ping body |
| `…/problem/blocked-media` | `410` | that hash is on the takedown list: it existed, it was removed, it will not come back |
| `…/problem/rate-limited` | `429` | the caller is over its request budget |

`rate-limited` carries `Retry-After`; nothing else does.

`invalid-gtin`, `restricted-gtin` and `blocked-media` are decided by the request alone — the same path will always answer the same way — so they may be cached. Every other problem depends on the state of the index or on what is routed, and is served `Cache-Control: no-store`: a `404` today is the answer for an `opid` or a domain that may exist tomorrow.

## Media

A record's `media` entries name files the index fetches, stores under their SHA-256, and serves from:

```
https://media.prodid.org/sha256/{hex}
```

A [`media` claim](#property-names) exists only once the bytes are stored, and it carries the digest, the original URL, the licence, the source and the fetch time. Files are immutable: the URL is the digest, so it can never come to mean something else. A hash on the takedown list is deleted and cannot be stored again.

Everything below is per entry. A media entry that is refused, too big, or unreachable costs that entry and nothing else: **the record is never invalid because of its media**, and no media failure lapses a source.

### What is ingested

The type is decided by **sniffing the bytes**. The publisher's `Content-Type` is a hint and nothing more — it is the one part of a fetch a hostile or careless origin fully controls, and it is wrong often enough in ordinary catalogues to be useless as a gate.

| `kind` | stored when the bytes are | media type |
| --- | --- | --- |
| `image` | JPEG | `image/jpeg` |
| `image` | PNG, including APNG | `image/png` |
| `image` | GIF | `image/gif` |
| `image` | WebP | `image/webp` |
| `image` | AVIF | `image/avif` |
| `document` | PDF | `application/pdf` |

All six are registered with IANA: `image/jpeg` and `image/gif` in RFC 2045 and RFC 2046, `image/png` by the W3C, `image/webp` in RFC 9649, `image/avif` by the Alliance for Open Media, `application/pdf` in RFC 8118. An APNG is a PNG with extra chunks, so it sniffs as PNG and is stored as one.

The sniffed type and the entry's `kind` must agree. A PDF published as `kind: image`, or a JPEG as `kind: document`, is skipped: the publisher and the bytes disagree about what the file is, and guessing which is right is how the wrong thing gets served.

Nothing else is ingested. In particular:

- **SVG is out.** It is XML that can carry `<script>`, event handlers and external references, and served from `media.prodid.org` it would be active content on our own origin — the classic stored-XSS carrier. No amount of header hardening makes that a good trade for a product photo, which is raster anyway.
- **HTML and XHTML are out**, for the same reason and more directly.
- **Archives are out** — zip, gzip, tar. What is inside is invisible at fetch time, so ingesting one means redistributing something nobody looked at.
- **Anything executable is out**: binaries, installers, WebAssembly, scripts of every kind.
- **Office documents are out in v0.** They are macro carriers with a long history of it, and a publisher who wants a spec sheet carried can publish a PDF.

The list is short on purpose. Widening it is a spec change, not a configuration one.

### Caps

| what | cap |
| --- | --- |
| one image | 20 MiB |
| one document | 50 MiB |
| one media fetch | 60 s, on top of the crawler's 10 s to first byte |
| media entries in one record | 20 |

20 MiB holds any product photograph a publisher has a reason to serve, including a 4000 × 4000 original; 50 MiB holds a long illustrated manual. 20 entries is a gallery plus its documents — Google's own product feed allows eleven images — and a record listing more is a catalogue pretending to be a product.

Exceeding any of them skips the entry. The twenty-first entry of a record is not fetched; an image that turns out to be 30 MiB is dropped mid-fetch and not stored.

### Fetching

Media is fetched under the same guard as everything else the crawler touches: `https` only, default port, a public DNS name that resolves to a public address, never an IP literal, and at most the one `<host>` → `www.<host>` redirect.

**The same-host rule does not apply to media.** A feed must live on the document's host; an image must not. Product photography lives on CDNs, and forcing publishers to proxy their own images through the feed host would cost them money and us freshness. A media URL is therefore a fetch of a host the publisher picked, which has two consequences worth stating plainly:

- **Budget.** Media fetches count against the fetched host's per-host budget, in the unverified lane unless the source is verified at that host, and are additionally capped at **10 per minute and 200 MiB per minute for one host**. Without that second cap a 20 MiB media cap would be a far larger amplifier than the 1 MiB discovery document ever was.
- **Oracle.** A publisher can learn one bit about a host it named: whether the fetch produced a claim. It never learns a status code, an error, a redirect target or a timing — `media_failed` in the source status is a count for the whole crawl, not a per-entry report. That bit is the minimum a publisher needs to fix its own catalogue, and it is expensive: it costs a verified domain, it is bounded by that host's own rate limit, and it says nothing about anyone else's source.

### When it fails, and when it changes

A media entry that cannot be fetched produces no claim. The record is stored and its other claims stand; the entry is counted in `media_failed` and tried again on the next crawl of that record, which is the ordinary schedule and not a retry loop of its own. Nothing about it lapses the source: [lapse](#lapse) is decided by discovery, and media is not discovery.

Because the claim is keyed to the digest, the two ways a file changes both resolve themselves:

- **The URL changes, the bytes do not.** The digest is the same, so the stored file is the same and `media_url` does not move. The claim's value does change, because `url` is part of it, so the old claim is withdrawn and a new one is asserted — the file a reader loads never flickers, and the record of where it was published stays honest.
- **The URL stays, the bytes change.** A new digest means a new file, stored beside the old one, and a new claim; the claim on the old bytes is withdrawn because the record no longer asserts it. The old file stays addressable, because something may have linked it.

An unchanged record gives no signal that its bytes moved, so media is re-fetched when the record changes and otherwise no more often than every 30 days, with `If-None-Match` and `If-Modified-Since` where the origin offers them.

### Serving

Every file is served with:

| header | value |
| --- | --- |
| `Content-Type` | the sniffed type, never the publisher's |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'; sandbox` |
| `Content-Disposition` | `attachment` for `document`, inline for `image` |
| `Cache-Control` | `public, max-age=31536000, immutable` |
| `Access-Control-Allow-Origin` | `*` |

The CSP and the sandbox are belt and braces for a store that holds no active types anyway; a PDF is downloaded rather than opened in a viewer that would run inside our origin. A year of immutable caching is safe for the same reason the URL is a digest.

A blocked hash answers `410` with `…/problem/blocked-media`, not `404`: the file existed, it was removed deliberately, and it will not come back. Claims pointing at a blocked hash are withdrawn, and a record that re-publishes the file does not bring it back.

### Licences that can be ingested

The index stores the file and redistributes it, so a licence that does not allow redistribution cannot be ingested at all. The entry's `license` must be exactly one of these SPDX identifiers:

```
CC0-1.0  CC-BY-4.0  CC-BY-SA-4.0  CC-BY-ND-4.0  CC-BY-3.0  CC-BY-SA-3.0  CC-BY-ND-3.0
```

All seven are current SPDX identifiers (list 3.29.0) and all seven permit verbatim redistribution by anyone, which is exactly what we do. `ND` is on the list because we redistribute the file unmodified; every `NC` variant is off it, because our readers include commercial ones and we cannot pass on a restriction we do not track. Anything else — an unlisted identifier, a misspelling, a bare "all rights reserved" — is not ingested.

It is checked as a string, before the fetch, so a licence we cannot use costs nobody any bandwidth. The claim keeps the identifier, so a reader always knows the terms of the file it is looking at.

## Conformance

`bun run check` in this directory validates every example and fixture against the schemas, and runs the vector sets through reference implementations of the rules above.

| path | what it holds |
| --- | --- |
| [`fixtures/valid/`](fixtures/valid) | records that must validate |
| [`fixtures/invalid/`](fixtures/invalid) | records that must be rejected, each for one defect |
| [`fixtures/txt/`](fixtures/txt) | `_prodid` TXT record values |
| [`fixtures/gtin/`](fixtures/gtin) | GTIN classification |
| [`fixtures/brand/`](fixtures/brand) | brand normalization |
| [`fixtures/ndjson/`](fixtures/ndjson) | a feed and the line numbers that must be skipped |
| [`fixtures/merchant/`](fixtures/merchant) | a Merchant file and the records it must produce |

Every file in `fixtures/invalid/` has an entry in [`fixtures/expected.json`](fixtures/expected.json) naming the instance path, the schema keyword and, where it disambiguates, the error parameters that must reject it. A fixture that fails for a new and unrelated reason is a failure, not a pass. Six of the keywords name rules that live on top of the schemas rather than inside them, because JSON Schema cannot express them: `storable` for a string that cannot be stored, `gtin` for a value that is not a GTIN, `identifiable` for a record with no identifier the index can store, `self-reference` for an entity that lists its own `opid`, `order` for a `withdrawn_at` before its `seen_at`, and `digest` for a `media_url` that does not address its claim's `sha256`.

A TXT vector is `{ "value": [...], "outcome": "delegation" | "ignored" | "malformed", "host": "..." }`, where `value` is the RR's character-strings in order and `host` is the normalized host, present exactly when the outcome is `delegation`. The three outcomes are behavioural, not cosmetic: `ignored` means the RR is not a prodid record and discovery carries on without it, `malformed` means discovery fails.

Two independent implementations — the one in `validate.ts` and the crawler's — agreeing on these vectors is the point of all of them.

The Merchant fixture is derived, not asserted by hand: `bun run validate.ts --emit-merchant` rewrites the expected NDJSON from the reference mapping in the harness, and the check fails whenever the file on disk says something the mapping does not.

## Appendix: importing a Merchant feed

The first publishers arrive with a spreadsheet, not a web server. A [Google Merchant](https://support.google.com/merchants/answer/7052112) product file is the format they already keep, so the hosted publisher imports one and writes [`org.prodid.item`](schemas/org.prodid.item.json) lines out of it. This appendix is the mapping, against Google's current product data specification.

A Merchant file describes **offers**: what a seller sells, at what price, where, today. prodid records what a product **is**. The mapping is mostly a matter of keeping the second and dropping the first.

| Merchant attribute | becomes |
| --- | --- |
| `id` | `key`, and an `sku` identifier — it is the publisher's own stock code, and keeping it lets the next import find the same record |
| `title` | `name` |
| `description` | `properties.description` — unlike media, this is the publisher's own text about its own product, and it arrives in the file rather than being scraped from a page |
| `brand` | `brand` |
| `gtin` | a `gtin` identifier, as written; the index normalizes and classifies it |
| `mpn` | an `mpn` identifier, scoped by the normalized `brand` |
| `item_group_id` | `group` |
| `color`, `size`, `material`, `pattern` | `variant.color`, `variant.size`, `variant.material`, `variant.pattern` |
| `gender`, `age_group`, `size_type`, `size_system` | `properties.gender`, `properties.ageGroup`, `properties.sizeType`, `properties.sizeSystem` |
| `google_product_category` | `properties.googleProductCategory`, verbatim |
| `product_type` | `properties.productType`, verbatim, a list |
| `product_weight`, `product_length`, `product_width`, `product_height` | `properties.weight` and friends, as `{ "value": 480, "unit": "g" }` |
| `product_highlight` | `properties.highlights`, a list |
| `product_detail` | one `properties.<name>` per detail, from its three colon-separated sub-attributes |
| `energy_efficiency_class` | `properties.energyEfficiencyClass` |
| `multipack` | `properties.multipack`, a number: the specification's format for it is "Integer" |
| `is_bundle` | `properties.isBundle`, a boolean: the specification's supported values are `yes` and `no` |
| `certification` | `properties.certification`, a list, each value verbatim — the specification writes its three sub-attributes (`certification_authority`, `certification_name`, `certification_code`) colon-separated, as in `EC:EPREL:123456` |
| `image_link`, `additional_image_link` | `media` entries with `kind: "image"` |
| `document_link` | a `media` entry with `kind: "document"` |
| `price`, `sale_price`, `availability`, `shipping`, `condition`, `link`, and the rest of the offer | nothing |

**Why the offer is dropped.** Price, availability, shipping and condition belong to a seller on a day, not to the product: they differ between sellers, they change hourly, and a claim that stale would be worse than no claim. `link` goes the same way — a storefront URL is where a seller sells it, not a property of the thing.

**Variant axes versus qualifiers.** Google lists six attributes as the ones that distinguish products inside an `item_group_id` — `color`, `pattern`, `material`, `age_group`, `gender` and `size` — plus `variant_option` for anything else. Four of them become axes here: `color`, `size`, `material` and `pattern`, the ones a buyer actually picks between. `gender` and `age_group` stay properties, and so do `size_type` and `size_system`, which Google does not list as variant attributes at all: they describe the whole group, and as axes they would split one product into several the moment a publisher spelled one of them two ways.

**Repeated fields.** Google's data sources write a repeated attribute in one of two ways, and the import accepts both: every value in one cell separated by a comma with no space, or the attribute's name repeated as the header of several columns, one value each. **A cell is split on commas only when its header appears once in the whole file; when a header is repeated, every cell under it is taken whole.** That is the rule, and it is what makes the second form the way to carry a value with a comma in it — in the first form a comma always separates, which is why Google's instruction for a URL is to percent-encode it as `%2C`. The two forms are therefore chosen per file, not per cell: a file that repeats a header has said how that attribute is written everywhere in it.

The attributes read as repeated are `additional_image_link`, `product_type`, `product_highlight`, `product_detail` and `certification`; every other value is taken whole, so a `description` with commas in it stays one string. A repeated attribute always produces a list, even when the file gives it one value, so a consumer never has to handle two shapes.

**Product details.** Each `product_detail` value is three colon-separated sub-attributes: a section name, an attribute name and a value. The attribute name becomes a `properties` key by lowercasing it, dropping spaces, underscores and hyphens, and capitalizing each word after the first — `Machine wash` becomes `machineWash`. A detail that does not split into three parts, or whose name does not survive as `^[a-z][A-Za-z0-9]*$`, is dropped and reported.

The section name is not part of the key, so two details can want the same one. **A detail never overwrites anything: the first value for a key wins, and any later detail with that key is dropped and reported with the row's other dropped values.** The same holds against the properties the mapping itself produces — a detail that derives `productType`, `description` or any other mapped key is dropped, not merged — so a `product_detail` column can never quietly redefine what the rest of the row said.

**Categories.** `category` in a prodid record is a GS1 GPC brick code, and Google's taxonomy is a different taxonomy. Translating one into the other automatically would be guessing, so the import does not: both Google values are carried verbatim as properties, and `category` is set only if the publisher supplies a GPC code itself.

**Language and markets.** The product data specification has no language or country attribute: they are settings of the data source, so one file is one language and one set of markets. The import declares them and they become `lang` and `markets` on every record of the file.

**Media licences.** The Merchant format has no licence column, and [media is not ingested without one](#licences-that-can-be-ingested). The import therefore declares a single SPDX identifier that covers every image and document in the file, and it must be one of the ingestible ones; the declaration is recorded on every media entry the file produces. If the file carries a `license` column of its own, a row's value wins over the declaration. A file whose declared licence is not ingestible produces records without media, not records that fail.

**Rows that cannot become a record.** A row with no usable identifier, a GTIN that fails its check digit, or anything else the [record rules](#feeds) reject is skipped, and the import reports it by row number, counting the header as row 1 so the number matches what the publisher sees in the spreadsheet. One bad row costs its own row.

[`fixtures/merchant/`](fixtures/merchant) is a worked example: `feed.csv`, the `feed.ndjson` it must produce, and `expected.json` naming the declared language, markets and licence, and the row that must be skipped — row 6, whose GTIN check digit is wrong. Row 2 carries the comma form under a single `additional_image_link` header and the column form under two `product_type` headers, one of which holds a value with a comma in it; row 3 carries three details that collide, two of them dropped. The check derives the records from the CSV itself and compares them line by line, so the file and this table cannot drift apart.

## Licensing

This specification and the schemas are [CC0](LICENSE). `opid`s and identifier mappings published by prodid.org are CC0. Every other claim carries the license of its source.

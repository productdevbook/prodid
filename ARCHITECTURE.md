# Architecture

This file is the contract between everyone working on prodid. The spec in [`spec/`](spec/) defines what publishers and consumers see; this file defines how the reference implementation is built.

## Shape

```
publishers ──► edge (Cloudflare Workers) ──► index (Postgres) ◄── batch (bun CLI)
                 │
                 └─► R2: media, hosted feeds, dumps
```

- **edge** serves everything request-facing: the resolver (`/id/{opid}`, `/01/{gtin}`), schemas, ping, hosted publisher feeds on `*.prodid.org`, and the crawl/ingest/media pipeline on Queues and Cron Triggers. QR scans come from anywhere in the world; resolver responses are cached at the edge.
- **index** is Postgres, the system of record, reached from Workers through Hyperdrive. It is not D1: the claims store is expected to pass D1's per-database size limit, and entity resolution needs trigram, vector and large-join queries.
- **batch** is a bun CLI that runs next to Postgres with a direct connection, for work that does not fit a Worker: bulk imports of open datasets, entity resolution passes, nightly dumps.
- One language, TypeScript, so the edge, batch and the SDK integrators use share the same validation code.

## Publishing model

Identity and hosting are separate. A source's identity is a domain it controls. Where its feed is hosted is delegable and can change without changing the identity or any `opid`.

Discovery for `<domain>` runs from scratch on every crawl, DNS included:

1. DNS TXT at `_prodid.<domain>`. If a `v=prodid0` record exists it is followed exclusively: `v=prodid0; host=<host>`. The document is always `https://<host>/.well-known/prodid.json`; the record names a host, never a URL, so it cannot express a port, a path or a query. When `<host>` is not the domain itself the document **must** carry `"domain": "<domain>"`; a delegated document without it is rejected. DNS says "my document is there", the document says "I speak for that domain"; both must agree.
2. Only when no `v=prodid0` record exists: `https://<domain>/.well-known/prodid.json`.

DNS comes first because it is the stronger proof: whoever can place a file on a host is not always who owns the domain, and the owner must be able to override that. A step succeeds only with HTTP 200, a JSON content type, a body that validates against the feed schema, and a `domain` that names the domain being discovered (it may be absent only when the domain serves the document itself); anything else (an HTML fallback page, a wrong or missing `domain`) is not an answer. Anything that begins with `v=prodid0` is a prodid record: if it is malformed or over-long, discovery fails; it never falls through to `.well-known`. A document whose `domain` names someone else, with no delegation from that domain, speaks for nobody and is ignored. More than one `v=prodid0` record is an error, not a choice.

This gives three ways to publish, all producing the same records:

| who | how | source identity |
| --- | --- | --- |
| a brand with IT, or a platform (e-commerce SaaS, ERP, PIM) publishing on behalf of every merchant it hosts | serves `.well-known/prodid.json` on the merchant's domain | the domain |
| a manufacturer with a domain it cannot serve files from | uploads CSV or uses the API at `<slug>.prodid.org`, adds one TXT record | the domain, verified by DNS |
| a manufacturer with no domain | uploads at `<slug>.prodid.org` | `<slug>.prodid.org`, unverified |

A name under the hosting zone (`<slug>.prodid.org`) is always a `hosted` source and always `unverified`, however it was discovered: serving a document there proves control of a slug, not of a domain.

Sources that are not the brand owner (retailers, registries, open datasets, contributors) are sources like any other; their claims are attributed to them and never overwrite anyone else's.

Trust is a property of the source, not of a claim:

| trust | meaning |
| --- | --- |
| `authoritative` | domain control proven and ownership of the brand confirmed |
| `verified` | domain control proven |
| `unverified` | hosted slug with no domain, dataset import, or community contribution |

There is no publishing API key. `POST https://prodid.org/ping {"domain": "..."}` asks the index to run discovery for a domain now. It grants the caller no say over content, but it does make the index issue DNS queries and HTTP fetches on the caller's word, so the crawler is built as if every ping were hostile:

- it fetches only `https`, default port, public DNS names whose **every** resolved address is public, never IP literals, and never follows a redirect off the host it asked (`<domain>` → `www.<domain>` is the one exception);
- a delegation names a host and the document path is fixed, and feeds must be on the same host as the discovery document, so a document or a TXT record can never aim the crawler at an arbitrary URL; a document listing a feed on another host is rejected whole;
- discovery documents and feeds have size and time caps, and the caps fit inside the platform limits of the code that enforces them: a cap the runtime would kill the crawler for reaching is not a cap;
- the address check and the connection are two resolutions, and a Worker cannot pin the address it checked. The check is re-done for every fetch rather than cached for a crawl, and what ultimately keeps the crawler out of private networks is stated in the code exactly as the platform documents it, not more;
- rate limits apply per pinged domain, per registrable domain of the pinged domain, per fetched host, and per caller (client address: IPv4 /32, IPv6 /64). A ping carries up to 1000 domains, so a platform can introduce every merchant it hosts in hours; the caller limit counts requests;
- both lanes of the per-host budget grow with the number of sources verified at that host, because a host that serves documents naming thousands of domains has asked to be crawled; a host nobody is verified at never gets more than the base rate;
- the per-host budget has two lanes: crawls of sources already verified at that host are reserved capacity that discovery on behalf of unverified domains cannot consume, so nobody can starve a publisher's crawl by pointing strangers' domains at its host;
- a fetch held back by the crawler's own limits is deferred and rescheduled. It is not an outcome: it never counts as a failure, a negative, or a lapse.

A source whose discovery stops succeeding is **lapsed**, not deleted. A definite negative (discovery ends with no acceptable document: no prodid record and no document on the domain, a malformed or duplicated record, or a document that no longer agrees) sets `lapsed_at` at once. A transport failure (timeout, 5xx, 429, a cap reached) changes nothing by itself, but seven days in which every attempt fails that way also sets `lapsed_at`, so serving errors forever is not a way to freeze claims. A crawl succeeds only when everything the document lists was read (200 or 304): a feed that cannot be fetched makes the crawl a transport failure, even though the feeds that did answer are still ingested, so a healthy document in front of a permanently broken feed lapses like any other source that cannot be read. A lapsed source accepts no new claims and is shown as lapsed to readers, and its `publisher.contact` is notified; after 30 days of continuous lapse its records and their active claims are withdrawn together. A crawl of a lapsed source writes nothing until it has succeeded in full; only then is the lapse cleared and the source ingested again. Claims re-asserted after a withdrawal are new assertions with a new `seen_at`: for the length of the gap nobody verifiable stood behind them, and the withdrawn rows are the record of what was said before.

A source gets the benefit of the doubt only at a host it has been verified at. Any failure at a host it has never been verified at, a timeout or a 5xx included, is a definite negative. A publisher moving hosts loses nothing by this, since a lapse is recoverable for 30 days, and it means the status page can never be used to learn how somebody else's host answers the crawler.

The same bound applies inside a feed. A line that is too long, unparseable or invalid is skipped, and because its key is unknown a feed with skipped lines withdraws nothing, for at most seven days; after that, absent keys are withdrawn as usual. Every source has a public status (last crawl, outcome, skipped lines, lapse) so none of this happens silently. `ping` still returns nothing about a crawl; the status is about what the domain itself publishes. A domain becomes a source only at its first successful discovery: until then there is no row and `/source/{name}` is a 404, and the HTTP status of a fetch is shown only for the host a source was last verified at. Otherwise anyone could point a throwaway domain at a host of their choosing and read back, through the status page, how that host answers the crawler.

Write access to `_prodid.<domain>` is control of the identity, as with DKIM or ACME DNS-01; it must not be delegated to vendors. A publisher that serves its own document should still publish `v=prodid0; host=<domain>`: with that record in place, someone who can only add records can cause a visible, recoverable lapse but not a takeover. A domain that changes hands is a new controller of the same identity; the crawl log and the claim timestamps are the record of when.

A source row is permanent and its `id` never changes; `sku` identifiers are scoped to that `id`, not to the name. When a domain's first verified delegation points at a host that is itself a source publishing that same document, that row becomes the domain (its `name`, `kind`, `verified_by` and `feed_host` change in place), so a publisher that starts at `<slug>.prodid.org` and adds a domain later keeps every identifier and every `opid`. The hosted publisher writes `domain` into the served document only after it has seen the TXT record itself; until then the slug publishes under its own unverified identity.

## Repository layout and ownership

| path | contents | owner |
| --- | --- | --- |
| `spec/` | specification, JSON Schemas, examples, fixtures | spec |
| `db/` | SQL migrations, dev Postgres, migrate script | db |
| root workspace files, `packages/core/` | pure TypeScript, no I/O: GTIN, opid, record validation, NDJSON, discovery rules | core |
| `packages/store/`, `apps/edge/` | SQL access, the Worker | edge |
| `apps/batch/` | bulk imports, resolution, dumps | edge |
| `apps/web/` | the prodid.org website: landing, rendered spec, publisher guide | web |

An owner changes only its own paths. A change that needs another owner's path goes through the coordinator. A **review** member owns no path: it re-runs every check itself and audits each delivery against the spec and this file.

## Routing on prodid.org

| route | served by |
| --- | --- |
| `prodid.org/id/*`, `prodid.org/01/*`, `prodid.org/source/*`, `prodid.org/ping`, `prodid.org/schemas/*` | edge |
| `*.prodid.org/*` | edge (hosted publisher feeds) |
| `media.prodid.org/*` | R2 bucket `prodid-media` |
| everything else on `prodid.org` | web, a static site on Workers Static Assets |

edge and web deploy independently; the more specific routes win.

## Index contract

Plain SQL migrations in `db/migrations/NNNN_name.sql`. Tables:

- `source(id, kind, name, trust, verified_by, verified_at, verified_crawl, lapsed_at, failing_since, feed_host, license, last_crawled_at, created_at)`. `failing_since` is the start of the current unbroken run of transport failures, cleared by any other outcome; seven days of it sets `lapsed_at`. `verified_crawl` is the `crawl` row that proved control: a finished, successful crawl of this same source. `trust` above `unverified` exists exactly when that proof does. `kind` in `domain | hosted | dataset | community`. `name` is the identity (a domain, a slug host, a dataset id) and is unique. `feed_host` is where the discovery document is fetched from when delegated; null means `name`. `verified_by` in `well-known | dns-txt`.
- `feed(source, url, etag, last_modified, last_fetched_at, last_status, skipping_since)`, primary key `(source, url)`. `skipping_since` is the start of the current unbroken run of fetches with skipped lines, cleared by a fetch with none; for seven days from it the feed withdraws nothing. One row per URL fetched for a source, the discovery document included; this is the state conditional requests are built from.
- `crawl(id, source, via, document_url, started_at, finished_at, outcome, http_status, records_seen, records_changed, lines_skipped, feeds_failed, conflicts, error)`. `conflicts` records identifier disagreements found during ingest. `outcome` in `changed | unchanged | no-discovery | rejected | fetch-failed`: `no-discovery` when no document was ever fetched (no record and nothing on the domain, or a malformed or duplicated record), `rejected` when one was fetched and refused; the public source status reports it as `success` (the first two), `definite-negative` (the next two) or `transport-failure`, and never exposes `error`. Append-only log of every discovery run: what was observed, by which path (`well-known | dns-txt`), and what it changed. This is the audit trail for verification.
- `entity(opid, kind, parent, merged_into, created_at)`. `opid` matches `^[0-9a-hjkmnp-tv-z]{16}$`. `kind` in `family | variant | item`. `parent` links item → variant → family. A merged entity keeps its row and points at the survivor.
- `identifier(scheme, scope, value, opid, first_source, first_seen)`, unique on `(scheme, scope, value)`. `value` is stored normalized (GTIN as 14 digits). `scope` is `''` for global schemes, the normalized brand for `mpn`, the source `id` for `sku` and `rcn` (readers are shown the source's name instead; the id never leaves the index). A GS1 restricted-circulation number has a valid check digit but is not globally unique, so it is stored as `rcn`, never as `gtin`; the all-zero GTIN is a placeholder and is invalid. Brand normalization is defined in the spec and folds the Turkish dotted and dotless i, so one brand is one scope.
- `record(source, key, feed, opid, hash, body, first_seen, last_seen, withdrawn_at)`, primary key `(source, key)`. `feed` is the URL the record was last read from, so a key is withdrawn when it is absent from its own feed and a feed that answered 304 is left alone. The published record as received; `hash` of its canonical JSON decides whether a re-crawl changed anything.
- `claim(id, opid, property, value, lang, source, record_key, seen_at, withdrawn_at, evidence)`. `value` is `jsonb`. Nothing about an entity is stored outside a claim.
- `grouping(source, kind, key, opid)`, primary key `(source, kind, key)`. `kind` in `family | variant`; `key` is the lowercase hex SHA-256 of the UTF-8 bytes of the canonical grouping key string `@prodid/core` derives from a record; core exports the digest so no caller computes it by hand. It remembers which family and variant entity a source's `group` and variant axes produced, so a re-crawl finds them again.
- `merge(id, from_opid, into_opid, reason, decided_by, decided_at, reverted_at)`. Matching decisions, reversible.
- `media(sha256, bytes, content_type, first_seen, blocked_at)`. A blocked hash is deleted from R2 and cannot be stored again.

### Semantics

- **Hierarchy.** Always three levels. A family has no parent, a variant's parent is a family, an item's parent is a variant; an item with no variant axes gets a variant of its own. The database enforces the parent's kind.
- **Resolution.** A record's item is found through its normalized identifiers: an exact match on `(scheme, scope, value)` reuses the entity, otherwise a new item is minted. When identifiers of one record point at different entities, the most specific global one wins (`gtin` before everything else) and nothing is merged automatically; the disagreement is recorded on the crawl. A source's family and variant come from `grouping`; when a record resolves to an item another source already created, the source's unmapped grouping keys adopt that item's existing variant and family, and a conflicting mapping keeps the item where it is. Automatic merging is not part of v0.
- **History lives in claims, not in records.** `record` holds only the latest body. When a re-crawl finds a changed record, the new claim set is diffed against the record's active claims: claims in both are left untouched, so `seen_at` stays the time a fact was first asserted; claims no longer asserted get `withdrawn_at`; new ones are inserted. Active claims are unique on `(source, record_key, opid, property, lang, value)`.
- **Withdrawal.** A key absent from a successfully fetched feed sets `record.withdrawn_at` and, in the same transaction and with the same timestamp, withdraws every active claim of that record. Readers look only at `claim.withdrawn_at`; `record.withdrawn_at` is the crawler's bookkeeping. A key that comes back clears `record.withdrawn_at` and inserts fresh claims; the withdrawn rows remain as history. A failed fetch withdraws nothing.
- **Claims without a record** are allowed: decisions and values derived by the index itself. Everything published, imported or contributed arrives as a record.
- **Merge.** The `merge` table is the log, `entity.merged_into` is the current state, and both change in one transaction. At most one un-reverted merge exists per `from_opid`. There are no chains: a merge always targets the final survivor, and merging a survivor repoints everything that was merged into it. Identifiers and claims are never repointed; they stay on the opid they were written to, and reads follow `merged_into`. That is what makes a revert lossless: clear `merged_into`, set `reverted_at`.
- **A media claim is completed by ingest.** Core derives what the publisher said (`url`, `license`, `kind`) as pending media, not as a claim; the pipeline fetches the file, stores it under its SHA-256, and only then writes the `media` claim with the stored value. Until the file is stored there is no claim.
- **Sets are claimed per element.** `markets` and `media` produce one claim per entry, so reordering a list changes nothing.
- **Only storable strings.** A record with a string that is not well-formed Unicode or contains U+0000 is invalid and its line is skipped: RFC 8785 refuses the first and `jsonb` refuses both.
- **Value equality** is canonical JSON as `@prodid/core` defines it (RFC 8785). Every writer passes values through it before they reach the database, so `480` and `480.0` are one value; the database's digest is a guard against duplicates, not the definition of equality.
- **Records and claims are never deleted**, only withdrawn. No foreign key cascades.
- **Writing `jsonb` through postgres.js.** A parameter cast as `::jsonb` is stored as a JSON string, not as the value; every writer sends canonical text and casts `::text::jsonb`, and reads `value::text` and parses it. Assert `jsonb_typeof` in tests.
- **Bulk cost.** Measured on the development machine, one million rows in one statement: `entity` 11 s, `record` 32 s, `claim` 47 s. The generated keys and foreign keys that hold the invariants are most of that, and they stay; batch imports are planned around these numbers.
- These write paths live in `packages/store`, shared by edge and batch. The database enforces invariants, not procedures, and it enforces them under concurrency: an invariant that holds only for one session at a time is not enforced.

## Rules

- Latest stable versions of everything: runtime, database, libraries, `compatibility_date`. Verify against the registry (`npm view`, image tags, release pages) before pinning; never pin from memory.
- `bun run check` at the repository root is the truth: typecheck, lint, tests, spec fixtures. Nothing is reported as working unless it ran.
- Everything in the repository is English. No comments unless the code cannot say it.

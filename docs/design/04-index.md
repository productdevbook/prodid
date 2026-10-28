# 04 · Index

The system of record: Postgres, written only through `packages/store`, shared by edge and batch.
Normative text: `ARCHITECTURE.md` *Index contract* and *Semantics*.

## Model

- **[Exists]** Tables `source`, `feed`, `crawl`, `entity`, `identifier`, `record`, `claim`,
  `grouping`, `merge`, `media`, `schema_migrations`, with the invariants enforced in the database
  under concurrency (deferred triggers, unique partial indexes, `for share` locks).
  `db/migrations/0001_init.sql`; tests `db/test/smoke.ts`, `db/test/race.ts`,
  `apps/edge/test/concurrency.test.ts`.
- **[Exists]** Migrations are plain SQL, applied by `db/migrate.ts` under
  `pg_advisory_lock(1886350180, 1)`. `0001_init.sql` is frozen from now on: production exists, so
  every change is a new numbered migration.
- **[Exists]** Writing `jsonb`: canonical text cast `::text::jsonb`, read as `value::text`.
- **[Exists]** Measured bulk cost per million rows in one statement: `entity` 11 s, `record` 32 s,
  `claim` 47 s. Batch work is planned around these.

## Resolution and grouping

- **[Exists]** Exact match on `(scheme, scope, value)` reuses an entity, otherwise a new item is
  minted; on disagreement the most specific global identifier (`gtin`) wins and the conflict is
  recorded in `crawl.conflicts`; nothing merges automatically. `packages/store/src/ingest.ts`.
- **[Exists]** Families and variants come from `grouping`; unmapped keys adopt an existing item's
  variant and family.
- **[Exists]** History lives in claims: a changed record is diffed against its active claims;
  `seen_at` survives an unchanged value. Withdrawal shares one timestamp across record and claims.

## Merges

- **[Exists]** `mergeEntities` and `revertMerge` (`packages/store/src/merge.ts`) with the no-chains
  rule, repointing of survivors and a reversible log; reads follow `merged_into` (308, `merged_from`).
  Only tests call them.
- **[New]** Operator commands in `apps/batch`, on a direct `DATABASE_URL`:
  - `prodid-batch merge <from-opid> <into-opid> --reason "<text>"`: both opids exist, have the same
    kind, `from` is not already merged; prints the merge id and the final survivor.
  - `prodid-batch unmerge <from-opid>`: reverts the active merge of that opid; prints what now
    resolves where.
  - `decided_by` is the value of `PRODID_OPERATOR` (required, e.g. a GitHub login); `reason` is
    required and at most 500 characters.
  - Both refuse to run when `DATABASE_URL` is unset, and print the database host they are about to
    write to before writing.
- **[New]** `prodid-batch candidates [--limit 100]` lists pairs of items from different sources
  that share a normalized brand and an identical `name` claim and have no conflicting `gtin`, one
  line per pair with both opids and both sources. It reads only; merging stays a human decision.

## Media storage and takedown

- **[Exists]** Files stored in R2 `prodid-media` under `sha256/{hex}`, de-duplicated, re-checked after
  30 days, the claim written only once the file is stored. `apps/edge/src/media/`,
  `packages/store/src/media.ts`.
- **[Exists]** `blocked_at` is honoured by ingest (never stored again) and by serving (410).
- **[Change]** `blockMedia` only inserts or marks the `media` row. The spec says claims pointing at
  a blocked hash are withdrawn and `ARCHITECTURE.md` says the file is deleted from R2; neither
  happens. `blockMedia` withdraws, in the same transaction and with the same timestamp, every active
  `media` claim whose value's `sha256` is the hash, and records `media.blocked_reason` (migration
  `0003_media_block_reason.sql`, never shown to readers).
- **[New]** `prodid-batch block-media <sha256> --reason "<text>"`:
  1. calls `blockMedia`;
  2. deletes `sha256/<hex>` from the `prodid-media` bucket through R2's S3 API
     (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_MEDIA_BUCKET`);
  3. purges `https://media.prodid.org/sha256/<hex>` from the Cloudflare cache
     (`CLOUDFLARE_API_TOKEN` with Cache Purge, `CLOUDFLARE_ZONE_ID`), because the file was served
     `immutable` for a year;
  4. prints the number of claims withdrawn and the result of each step; a failed step exits
     non-zero and running the command again finishes it.
  Browser caches that already hold the file cannot be reached; the spec's 410 is for everyone
  else.

## Dumps

**[New]** The pillar "the index is replaceable" needs a full export anyone can load.

- **Where.** R2 bucket `prodid-dumps`, public custom domain `dumps.prodid.org`. A dump is a dated
  directory `https://dumps.prodid.org/v0/<YYYY-MM-DD>/`; `https://dumps.prodid.org/v0/latest.json`
  is a copy of the newest manifest, written last.
- **Files**, gzip-compressed NDJSON, all written from one `repeatable read` snapshot so they agree:

  | file | one line per | fields |
  | --- | --- | --- |
  | `sources.ndjson.gz` | source | the `org.prodid.source` status document |
  | `entities.ndjson.gz` | entity, merged ones included | the `org.prodid.entity` document as `/id/{opid}?history=1` answers it; a merged opid's line carries `merged_into` |
  | `records.ndjson.gz` | record | `source` (name), `key`, `feed`, `opid`, `body`, `first_seen`, `last_seen`, `withdrawn_at` |
  | `groupings.ndjson.gz` | grouping | `source` (name), `kind`, `key` (what the grouping is on, written out: never the index's digest, which embeds the internal source id), `opid` |
  | `merges.ndjson.gz` | merge | `from`, `into`, `decided_at`, `reverted_at` |
  | `manifest.json` | — | `org.prodid.dump` |

- **Never in a dump:** a source's internal `id`, `contact`, `notified_lapse_at`, `crawl.error`,
  the crawl log, `merge.reason` and `decided_by`, `media.blocked_reason`, or media bytes. The crawl
  log holds per-host observations the status page deliberately hides (pillar 4), so it stays with
  the operator.
- **Manifest** `org.prodid.dump` (new schema `spec/schemas/org.prodid.dump.json`): `$type`,
  `version: 0`, `created_at`, `snapshot_at`, and `files: [{ name, sha256, bytes, lines }]`, plus
  `licenses`: `opid`s, identifiers, hierarchy, groupings and merges are `CC0-1.0`; every claim and
  record carries the licence its source declares in `sources.ndjson.gz`. In the manifest this is
  `"licenses": { "index": "CC0-1.0", "claims": "source" }`.
- **Spec.** *Dumps* states the files, the line of each, the exclusions, the licences and the
  retention; the schema, `examples/dump.json` and the `dump.*` fixtures go with it.
- **Grouping keys and the loader.** The store's `grouping.key` is the SHA-256 of a key that
  includes the internal `source.id` (`groupingKeys`, `packages/core/src/claims.ts`), and `sku` and
  `rcn` scopes are that id too. A dump carries neither, so `load-dump` assigns its own source ids and
  derives its own digests and scopes from the dump's written-out grouping keys and record bodies.
- **Retention.** Daily dumps are kept 7 days; the first dump of each month is kept for good.
- **Writer.** `prodid-batch dump` streams each table through a cursor, gzips, uploads with
  multipart to R2's S3 API, then writes the manifest and `latest.json`. It prints line counts and
  bytes per file and the elapsed time. It runs nightly at 04:30 UTC next to Postgres (chapter 07).
- **Reader.** `prodid-batch load-dump <dir|url> ` loads a dump into an empty database migrated to
  the same version. Afterwards `/id/{opid}` on that index answers the same JSON as the dump's line,
  and a crawl of any source continues from its records and groupings instead of minting new
  entities. This is the replaceability proof and has its own test.

## Datasets

**[New]** Open datasets enter as `dataset` sources, always `unverified`.

- **Naming.** `dataset:<slug>`, slug grammar as for hosted slugs; `/source/dataset:wikidata`
  answers its status.
- **Import path.** `prodid-batch import <dataset> <file>` maps the dataset's export into
  `org.prodid.item` records with a pure mapping in `packages/core/src/datasets/<dataset>.ts`, then
  writes them through the same `packages/store` ingest the crawler uses, with `feed = null`. A full
  import withdraws keys absent from it. Each import writes a `crawl` row with `via = 'import'` and
  `document_url` = the export's public URL.
- **[Change]** `crawl.via` and the status schema's `via` gain `import`; the spec's *A source's status*
  says so. Migration `0004_dataset_import.sql`.
- **First dataset: Wikidata.** CC0, so its claims add no licence condition to a dump. Key = the QID;
  `name` = the English label; `brand` = the label of the item's brand; identifiers from its GTIN
  property; items with no GTIN or no brand are skipped and counted. No media in v0: Commons files
  carry per-file licences. The property ids are confirmed against wikidata.org when the mapping is
  written and recorded here as an as-built note.

## Authoritative brands

**[New]** `authoritative` means domain control proven **and** ownership of the brand confirmed.

- **Evidence.** The operator confirms that the GS1 company prefix of GTINs the source publishes is
  licensed to the organization that controls the domain, using GS1's public "Verified by GS1"
  lookup, and records the lookup URL as evidence. (Assumption, owner to confirm.)
- **Storage.** Table `authority(id, source, brand, evidence, decided_by, decided_at, revoked_at)`,
  `brand` normalized; migration `0005_authority.sql`. A source is `authoritative` while it is
  `verified` and has at least one un-revoked row; losing verification or lapsing drops it to what
  the proof supports, with no operator action.
- **Commands.** `prodid-batch grant-authority <source> <brand> --evidence <url>` and
  `prodid-batch revoke-authority <id> --reason "<text>"`.
- **Spec.** *Trust* gains a paragraph stating the evidence rule and that the grant is per brand
  and revocable.

## As built

- `blockMedia` on a hash that is already blocked keeps the first `blocked_at` and
  `blocked_reason`, and returns 0: no active claim names the hash any more
  (`packages/store/src/media.ts`).
- `attachMediaClaim` reads the `media` row `for share` in its transaction and writes no claim when
  the hash is blocked or has no row, so a claim racing a block is either withdrawn by it or refused.
- `prodid-batch block-media <sha256> --reason TEXT` (`apps/batch/src/takedown.ts`) needs
  `DATABASE_URL`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_MEDIA_BUCKET`,
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`, and refuses to start when any is unset. It prints
  the database host, then one line per step (`block:`, `delete:`, `purge:`, each `ok` or
  `failed`). A failed block stops the run; the delete and the purge are each tried whatever the
  other did. Any failure exits 1.

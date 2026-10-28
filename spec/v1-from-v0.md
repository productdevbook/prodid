# prodid spec v1: what changed from v0

v1.0.0 is dated 2026-10-28. The normative text is [`README.md`](README.md); this note lists what is
different from v0, the two decisions v1 rests on, and what each kind of reader and writer has to do.
The v0 text is `spec/README.md` as it stood in the parent of the first commit that says
`Refs #80` in the history of that file.

v1 freezes v0. It adds a `version` to the two documents that had none, moves every schema to
`/schemas/v1/`, and turns each "in v0" in the text into a v1 rule. No record, feed, `_prodid`
record, discovery rule, trust level, lapse rule, problem type, media rule, or the set of dump
files changes.

## Decisions

1. **The `_prodid` TXT record keeps `v=prodid0`.** The tag versions the record, not the
   specification, and the record is unchanged in v1. A new tag would cost every delegating domain a
   DNS edit, the change a publisher is most likely to get wrong, for nothing a reader could use;
   worse, a reader that does not know `prodid1` ignores the record, and a domain whose only record
   is ignored is discovered through `.well-known` on the domain instead, the weaker proof. A record
   version changes only with a record a v0 reader could not parse. Owner decision #98, item 1.
2. **v0 discovery documents are accepted for 90 days**, by every crawl that starts before
   2027-01-26T00:00:00Z, and refused by every crawl that starts at or after it. The instant is
   fixed: it does not move with the date the `spec-v1.0.0` tag is made or the index deployed. A
   refused v0 document is a definite negative like any document that does not validate, so a
   publisher who misses the date still gets the lapse notice and 30 days to recover before its
   claims are withdrawn. Owner decision #98, item 2.

## Every change

| # | where | v0 | v1 |
| --- | --- | --- | --- |
| 1 | status | draft; anything may change | v1.0.0, stable; v1.x changes only by addition, anything else is v2 (*Versions*) |
| 2 | every schema's `$id` | `https://prodid.org/schemas/v0/<$type>.json` | `https://prodid.org/schemas/v1/<$type>.json` |
| 3 | `org.prodid.feed` `version` | `0` | `1` |
| 4 | `org.prodid.dump` `version` | `0` | `1` |
| 5 | `org.prodid.entity` | no `version` | `version` required, `1` |
| 6 | `org.prodid.source` | no `version` | `version` required, `1` |
| 7 | `org.prodid.item` | — | unchanged but for its `$id`; still no `version`, and the two schemas accept the same records |
| 8 | schemas served | `/schemas/v0/` | `/schemas/v0/` and `/schemas/v1/`, both for good, both with `Access-Control-Allow-Origin: *` (*The resolver*) |
| 9 | what the index accepts | v0 | v1, and v0 until 2027-01-26T00:00:00Z (*Versions*, *Discovery*) |
| 10 | what the index answers | v0 entities, statuses, dumps | v1 only, no negotiation; unversioned paths, problem types and media URLs unchanged (*Versions*) |
| 11 | dumps | `https://dumps.prodid.org/v0/` | `https://dumps.prodid.org/v1/`; v0 dumps stay under `v0/` with the same retention, and `v0/latest.json` keeps naming the last one (*Dumps*) |
| 12 | dump lines | sources and entities without `version` | each carries `"version": 1`, following from 5 and 6 (*Dumps › Files*) |
| 13 | what a dump never holds | not stated for grants | the grants of authority and their evidence are named; this is how dumps were built in v0 (*What a dump never holds*) |
| 14 | the TXT record | `v=prodid0` | `v=prodid0`, stated as the record's own version (*The `_prodid` TXT record*) |

## Files

v0 is kept where it was, unchanged: the schemas directly in `schemas/`, `examples/`, and the
vectors in `fixtures/valid/`, `fixtures/invalid/`, `fixtures/expected.json` and `fixtures/dump/`.
v1 is beside it:

| path | holds |
| --- | --- |
| `schemas/v1/` | the five v1 schemas |
| `fixtures/v1/examples/` | the v1 examples, the v0 examples with changes 3 to 6 applied |
| `fixtures/v1/valid/`, `fixtures/v1/invalid/`, `fixtures/v1/expected.json` | the v0 vectors with changes 3 to 6 applied, plus `entity.version-missing.json` and `source.version-missing.json`; `feed.version-not-zero.json` becomes `feed.version-not-one.json`, a v0 document the v1 schema refuses |
| `fixtures/v1/dump/` | the v0 dump vectors with change 4 applied; `version-not-zero.json` becomes `version-not-one.json` |

`fixtures/txt/`, `gtin/`, `brand/`, `ndjson/`, `merchant/` and `datasets/` hold for both versions.

## Open questions

Each "in v0" of the v0 text, closed in v1:

- **Feeds on a host other than the document's**, a CDN hostname included: not supported in v1
  (*Feeds*). Allowing them would make documents valid that v1 refuses, which a v1.x may do as an
  addition.
- **Office documents as media:** out in v1 (*What is ingested*).
- **GS1 Digital Link qualifiers** after `/01/{gtin}`, such as `/10/{lot}` and `/21/{serial}`:
  accepted and ignored in v1, which resolves on the GTIN alone (*The resolver*).
- **Property names:** v1 defines exactly the seven of *Property names* and no others.

Carried, decided for now and open to the owner:

- **Authority grants in dumps** (owner decision #97): not carried, so an index loaded from a dump
  shows a formerly `authoritative` source as `verified` until its own operator grants again. v1
  states it (change 13). A sixth dump file holding grants would be a v1.x addition.
- **The TXT version and the 90 days** (owner decision #98): the two decisions above.

## What each party does

| who | what |
| --- | --- |
| a publisher serving its own discovery document | change `"version": 0` to `"version": 1` before 2027-01-26T00:00:00Z; nothing else |
| a domain delegating to a host | nothing: the `_prodid` record is unchanged, and the host writes the document |
| a hosted site on `<slug>.prodid.org` | nothing: the hosted publisher serves v1 documents |
| a reader of the resolver | read `version`; a v1 entity or status carries `"version": 1` and is otherwise the v0 document |
| a reader of dumps | read v1 dumps under `/v1/`; a kept v0 dump stays under `/v0/` and validates against the v0 schemas for good |
| an implementation | validate by `version`: `0` or `1` for discovery documents and dump manifests, absent or `1` for entities and statuses; accept v0 discovery documents only before the cut-off |

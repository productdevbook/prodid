# 08 · Roadmap

Milestones in build order. Each ships on its own and leaves prodid.org and the repository better
than before. A theme that jumps the queue gets a fractional number (M2.5) so nothing is
renumbered.

## Milestones

**M1 · Open:** the repository goes public with no infrastructure detail in its tree or history,
and a stranger can clone it, run every check, understand the project and contribute.

**M2 · Promises kept:** everything the spec promises about the running index is true in
production: lapse notices are sent, takedown removes a file everywhere, no dead letter is lost,
media lives on its own origin, and the backups are proven to restore.

**M3 · First publishers:** real catalogues are crawled in production through all three
publishing routes, operator-assisted, and a QR scan lands on a page people can read.

**M4 · Self-service hosting:** a manufacturer without IT claims a slug, uploads its Merchant file,
connects its domain, exports or deletes its catalogue, with no operator in the path.

**M5 · Open data:** anyone can take the whole index with them: a nightly dump of every source,
entity, record and claim with its licence, and a tool that loads it into a new index.

**M6 · Datasets and matching:** open datasets enter as unverified dataset sources, starting with
Wikidata, and operators can merge and unmerge duplicates with a reversible log.

**M7 · Authoritative brands:** a brand owner's sources can be confirmed `authoritative` on
recorded, revocable evidence.

**M8 · Spec v1:** the spec is frozen as v1, and `@prodid/core` and `@prodid/spec` are published so
other implementations can be built and checked against the vectors.

## Orders that cannot change

1. **Infrastructure out of the tree and history before the repository is public** (P-001, P-002
   before P-021). After the flip, history is out for good. The rewrite runs right after P-001,
   before the rest of M1 is committed, so the commits other issues name keep their hashes.
2. **CI with a real Postgres, and skip-is-failure, before outside pull requests** (P-006, P-007,
   P-008 before P-021). Without them the edge tests are skipped and the run is still green.
3. **Spec before code** in every milestone: P-023 before P-024, P-030 before P-031, P-059 before
   P-061, P-068 before P-069, P-076 before P-077, P-080 before P-081.
4. **Mail before anything that sends it:** P-022 before P-025 and P-046.
5. **Claims withdrawn before bytes deleted:** P-026 before P-027, or claims would point at a file
   that no longer exists.
6. **Restore drill before the first outside catalogue** (P-032 before P-044): no publisher's data
   on backups nobody has restored.
7. **The designed entity page before the first outside catalogue** (P-036 before P-044): a real
   product's QR code must land on a readable page.
8. **`0001_init.sql` is frozen.** Migrations are numbered in merge order: 0002 contact (P-024),
   0003 media block reason (P-026), 0004 dataset import (P-069), 0005 authority (P-077).

## Releases

prodid ships as deploys and as spec versions, not store builds.

| release | carries |
| --- | --- |
| repository public | M1 |
| production deploys of edge, hosted, web | M2, M3 (spec stays v0 draft) |
| hosted self-service on publish.prodid.org | M4 |
| spec v0 draft gains dumps, datasets, authority | M5, M6, M7 |
| spec v1.0.0, `@prodid/core` and `@prodid/spec` 1.0.0 | M8 |

Within v0, schema changes are additive and land in `spec/` with their fixtures in the same or an
earlier commit than the code (`schema-drift.test.ts` and the spec-review hashes enforce it). The
crawler accepts only what the published schemas describe, so a new field never reaches readers
before the spec does.

## Owner decisions

One issue per milestone, numbered after the last backlog item, lists each question with the
choice the work proceeds on and "Confirm or revert":

| milestone | questions |
| --- | --- |
| M1 | history rewrite (proceeds on: rewrite, owner OK at the moment of force-push); where the k8s documents go (the private ops location); Hyperdrive id stays public (yes); Discussions (off) |
| M2 | mail provider and sender (Cloudflare Email Service, `notify@prodid.org`) |
| M3 | the domain used to prove route 1 in production (owner supplies); the canary slug (`canary`) |
| M4 | open sign-up vs invite-only (open, behind Turnstile); 5 sites per account; 30-day unused-slug release |
| M5 | dump retention (7 daily, monthly kept for good); `dumps.prodid.org` |
| M6 | first dataset (Wikidata); whether share-alike datasets such as ODbL may enter (not in M6) |
| M7 | the evidence for `authoritative` (GS1 company prefix, operator-checked) |
| M8 | the TXT version after v1 (`prodid0` kept); how long v0 documents are accepted (90 days) |

## Summary

| milestone | items | IDs | spec | docs | core | edge | hosted | web | db | ops |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 · Open | 21 | P-001–P-021 | 0 | 9 | 0 | 1 | 0 | 3 | 1 | 7 |
| M2 · Promises kept | 13 | P-022–P-034 | 2 | 0 | 0 | 6 | 1 | 0 | 0 | 4 |
| M3 · First publishers | 10 | P-035–P-044 | 0 | 1 | 0 | 2 | 1 | 1 | 0 | 5 |
| M4 · Self-service hosting | 14 | P-045–P-058 | 0 | 2 | 0 | 0 | 10 | 1 | 0 | 1 |
| M5 · Open data | 9 | P-059–P-067 | 1 | 0 | 1 | 3 | 2 | 1 | 0 | 1 |
| M6 · Datasets and matching | 8 | P-068–P-075 | 1 | 0 | 1 | 2 | 3 | 0 | 0 | 1 |
| M7 · Authoritative brands | 4 | P-076–P-079 | 1 | 0 | 0 | 1 | 1 | 1 | 0 | 0 |
| M8 · Spec v1 | 11 | P-080–P-090 | 2 | 2 | 2 | 1 | 1 | 1 | 0 | 2 |
| **total** | **90** | | **7** | **14** | **4** | **16** | **19** | **8** | **1** | **21** |

# prodid design

The whole product, written once from the code as it stands on 2026-10-28, approved by the owner
on 2026-10-28. Every work item in [backlog.md](backlog.md) comes from a chapter here; to change a rule,
change the chapter first.

The protocol itself is normative in [`spec/README.md`](../../spec/README.md) and the reference
implementation's contract in [`ARCHITECTURE.md`](../../ARCHITECTURE.md). The chapters do not
restate them. They say, point by point, what of it exists in the code, what changes, and what is
new, with enough detail to build the new parts without asking.

| chapter | domain |
| --- | --- |
| [01 · Identity and records](01-identity-and-records.md) | opid, identifiers, GTIN classification, brand normalization, records, claims |
| [02 · Publishing](02-publishing.md) | discovery, the `_prodid` record, feeds, trust, lapse, identity continuity, lapse notification |
| [03 · Crawler](03-crawler.md) | the pipeline on Queues and Cron, the fetch guard, caps, rate limits, dead letters |
| [04 · Index](04-index.md) | the Postgres model, resolution, merges, media storage and takedown, dumps, datasets |
| [05 · Reading](05-reading.md) | the resolver, entity and source documents, HTML pages, problems, media serving |
| [06 · Hosted publisher and operator](06-hosted-and-operator.md) | `<slug>.prodid.org`, the operator CLI, Merchant import, self-service hosting |
| [07 · Project and operations](07-project-and-operations.md) | the website, the public repository, CI, community files, deployment, production database, releases |
| [08 · Roadmap](08-roadmap.md) | milestones in build order |
| [backlog.md](backlog.md) | every work item, numbered `P-001`… |

## Status tags

Every point in a chapter carries one:

- **[Exists]** in the code today, with the file it lives in.
- **[Change]** in the code, changed here; the reason follows.
- **[New]** not in the code.

## Pillars

Every feature respects these. They settle arguments.

1. **No bare facts.** Every value a reader sees is a claim carrying its source, the source's trust
   and when it began asserting it.
2. **Identity is a domain; hosting is delegable.** Moving where a catalogue is served never changes
   who it speaks for or any `opid`.
3. **The index is replaceable.** The spec, the identifiers and full data dumps are open, so nobody
   needs prodid.org to keep the data.
4. **Hostile by default.** Every ping, document, feed and media URL is treated as an attack until
   checked, and the public status never becomes a probe.
5. **Nothing is deleted, only withdrawn.** History stays readable; a lapse is visible and
   recoverable.
6. **The spec leads.** A rule changes in `spec/` (text, schema, fixtures) before or with the code,
   and two implementations agree on the vectors.

## Decisions

Dates are when the decision entered the repository (commit date) or when the owner approved this
design (2026-10-28).

| date | decision |
| --- | --- |
| 2026-09-19 | One language, TypeScript, for edge, batch and the shared validation code (`ARCHITECTURE.md`). |
| 2026-09-19 | The index is Postgres reached through Hyperdrive, not D1: the claims store outgrows D1 and resolution needs trigram, vector and large-join queries. |
| 2026-09-19 | `bun run check` at the root is the truth; nothing is reported working unless it ran. |
| 2026-09-19 | Latest stable versions of everything, verified against the registry before pinning. |
| 2026-09-19 | Spec and schemas are CC0; code is Apache-2.0; published `opid`s and identifier mappings are CC0; other claims carry their source's licence. |
| 2026-09-19 | No publishing API key; `POST /ping` asks for a crawl and grants nothing. |
| 2026-09-19 | The hosted publisher is its own Worker, sharing no database, bucket or code path with the index beyond `@prodid/core` (c61b9ff). |
| 2026-10-28 | Production: one CloudNativePG instance, reached from Workers through Hyperdrive over Cloudflare Tunnel + Access (13d5c7b). |
| 2026-10-28 | Before the repository is public, production infrastructure documents leave it (they move to the private ops location) and the repository keeps a generic self-hosting guide. Chapter 07. |
| 2026-10-28 | The git history is rewritten once, before going public, to remove the infrastructure details already committed; the original is kept as a bundle outside the repository. Needs the owner's explicit OK (one-way). Chapter 07. |
| 2026-10-28 | The Hyperdrive config id stays in `apps/edge/wrangler.jsonc`: it is useless without the Access service token. Chapter 07. |
| 2026-10-28 | Outgoing mail (lapse notices, sign-in links) goes through Cloudflare Email Service from `notify@prodid.org`. Chapter 02. |
| 2026-10-28 | Media takedown is an operator command in `apps/batch`, which runs next to Postgres and reaches R2 through its S3 API. Chapter 04. |
| 2026-10-28 | Self-service hosting lives in `apps/hosted` on `publish.prodid.org`: email sign-in links, server-rendered pages, accounts in a D1 database of the hosted Worker's own. Chapter 06. |
| 2026-10-28 | Dumps are written by `apps/batch` to the R2 bucket `prodid-dumps`, served at `dumps.prodid.org`. Chapter 04. |
| 2026-10-28 | Dataset sources are named `dataset:<slug>`; the first dataset is Wikidata (CC0). Chapter 04. |
| 2026-10-28 | Spec v1 keeps the TXT version `v=prodid0` and accepts v0 discovery documents for 90 days, until 2027-01-26T00:00:00Z; v0 and v1 schemas are both served for good. Chapter 07. |
| 2026-10-28 | The repository's own `CLAUDE.md` and `.claude/agents/*.md` are public: they name no host, path or person outside the project. Private operator notes stay in the ops location. |
| 2026-10-29 | Languages (owner): the spec, schemas and repository stay English only, the one normative text. The index's HTML pages speak ten languages (en, zh-Hans, es, ar, fr, ru, pt-BR, de, ja, tr), because a scan lands any shopper there; the website's `/`, `/publish` and `/data` are English and Turkish. A further language follows its first real publisher. Chapters 05 and 07. |

## Glossary and canonical IDs

One name per thing, used in every chapter, issue, API field and file name. A new ID is added here
first.

| ID | meaning |
| --- | --- |
| `opid` | 16 lowercase Crockford base32 characters naming an entity; opaque, never reused |
| `family`, `variant`, `item` | the three entity kinds |
| `source` | a publisher, dataset or contributor; its `name` is its identity |
| `domain`, `hosted`, `dataset`, `community` | the source kinds |
| `authoritative`, `verified`, `unverified` | the trust levels |
| `well-known`, `dns-txt` | how a source was reached (`via`, `verified_by`) |
| `import` | how a dataset source's records arrived (`via` only) *[New]* |
| `dataset:<slug>` | the name of a dataset source *[New]* |
| `prodid record` | a TXT RR at `_prodid.<domain>` whose first tag is `v=prodid0` |
| `discovery document` | `https://<host>/.well-known/prodid.json`, type `org.prodid.feed` |
| `feed` | an NDJSON file of `org.prodid.item` records listed by a discovery document |
| `record`, `key` | one feed line, and its stable name in the feed |
| `claim` | `(opid, property, value, lang, source, seen_at)` |
| `lapse`, `lapsed_at` | a source whose discovery stopped succeeding |
| `definite negative`, `transport failure` | the two kinds of failed crawl |
| `withdrawn`, `withdrawn_at` | no longer asserted; kept as history |
| `retired feed` | a feed the document stopped listing |
| `slug` | the label of a hosted site, `<slug>.prodid.org` |
| `operator` | whoever holds `OPERATOR_TOKEN` (hosted) or `DATABASE_URL` (batch) |
| `ping` | `POST /ping` |
| `media`, `media_url` | a stored file, `https://media.prodid.org/sha256/{hex}` |
| `blocked` | a media hash on the takedown list |
| `merge` | a reversible decision that one opid is another |
| `dump` | a dated full export of the index *[New]* |
| `account` | a self-service publisher identity on `publish.prodid.org` *[New]* |
| `canary` | the hosted slug the project publishes itself to test production end to end *[New]* |
| `P-NNN` | a backlog item; `P-N` is GitHub issue `#N` |

Area IDs, used as `area:` labels: `spec`, `core`, `edge`, `hosted`, `web`, `db`, `ops`, `docs`.

## Working model

Approved 2026-10-28, with the playbook this design follows.

### Role agents (`.claude/agents/<role>.md`)

Each owns the paths `ARCHITECTURE.md` gives its owner and nothing else. The main session is the
orchestrator and the review member of `ARCHITECTURE.md`: it writes no feature code, re-runs every
check, pushes.

| agent | owns | model · effort |
| --- | --- | --- |
| `spec-editor` | `spec/`, `docs/design/`, `ARCHITECTURE.md`, README and community files; writes issues | opus · high |
| `core-engineer` | `packages/core/`, root workspace files | opus · medium |
| `edge-engineer` | `packages/store/`, `apps/edge/`, `db/migrations/` | opus · medium |
| `hosted-engineer` | `apps/hosted/`, `apps/batch/` | opus · medium |
| `web-engineer` | `apps/web/` | opus · medium |
| `ops-engineer` | `.github/`, `db/` except migrations, deployment, GitHub settings, Cloudflare objects, the production database | opus · medium |
| `device-tester` | nothing; drives the deployed or local site and the resolver in a browser at phone and desktop width, light and dark, and reports pass/fail with WebP screenshots | haiku · low |

`db/migrations/` moves from the `db` owner to `edge-engineer` because every migration so far has
been written for the store; the rest of `db/` (compose, migrate script, tests) is ops. These are
defaults until the orchestrator runs one blind bake-off task per role and records the result here.

Every agent file has the four parts of the playbook: read first (`CLAUDE.md`, `gh issue view`,
the chapter, the spec section), where things are, building and testing (exact commands below),
done (check passes, acceptance checked, what it ran). `disallowedTools: Agent`. Agents commit with
`Refs #n` and the co-author line, never push, never `git add -A`.

### Repository `CLAUDE.md`

Short, public, and pointing at the files that already hold the rules:

- **Layout:** the table in `ARCHITECTURE.md`, plus `docs/design/`.
- **Decisions:** this README's table, by reference.
- **Commands:**
  - `bun install --frozen-lockfile`
  - `bun run check` (format, lint, typecheck, tests, spec fixtures)
  - `bun run --filter '@prodid/db' up` then `bun run check:db` (Postgres smoke and race tests);
    edge tests run only when `DATABASE_URL` reaches a database
  - `bun run --filter '@prodid/db' migrate`
  - `bun run --filter '@prodid/core' build` (regenerates the validators from the schemas)
  - `bun spec/validate.ts --emit-merchant` (regenerates the Merchant fixture)
  - `bun run --filter '@prodid/web' spec:review <anchor>…` (re-records reviewed spec sections)
  - `bun run --filter '@prodid/edge' cf-typegen`, likewise for hosted
  - deploy: `wrangler deploy` in `apps/edge`, `apps/hosted`, `apps/web` (after `astro build`);
    routes are attached at deploy time
- **Rules:** the Rules section of `ARCHITECTURE.md`; commits are Conventional Commits with
  `Refs #n`.
- **Secrets:** live outside the repository; agents read them from files and never print them.

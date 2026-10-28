# Backlog

Every work item, numbered once in build order. `P-N` is GitHub issue `#N`. IDs are never reused;
a withdrawn item stays here, marked withdrawn. Owners are the role agents of the
[README](README.md#role-agents-claudeagentsrolemd); areas are the `area:` labels.

Pattern lists that name private infrastructure (node name, IP, account id, ops path, other
tenants) are kept with the private copy made in P-001, never in this repository. Acceptance lines
below refer to them as "the private pattern list".

## M1 · Open

### P-001 · Move the production infrastructure documents out of the repository

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - `db/k8s/` (README and the five manifests) is copied to the private ops location; `diff -r`
    between the copy and the tree shows nothing; the copy's path is reported to the owner, not
    committed.
  - The private pattern list is written next to the copy.
  - `db/k8s/` is removed in one commit; `git grep -E -f <pattern list>` in the tree finds nothing.
  - `bun run check` passes.

### P-002 · Rewrite the history once, before the repository is public

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-001 · **Chapters** 07
- **Acceptance**
  - The owner's explicit OK is quoted in the issue before the force-push.
  - `git bundle create <ops location>/prodid-before-public.bundle --all` and `git bundle verify`
    succeed; the bundle stays outside the repository.
  - `git filter-repo` with `--path db/k8s --invert-paths`, `--replace-text` and
    `--replace-message` from the private pattern list.
  - `git log -p --all | grep -E -f <pattern list>` and the same over `git log --all --format=%B`
    print nothing.
  - `bun run check` passes on the rewritten `main`; `main` is force-pushed to the private
    repository; the issue lists the old → new hash of the last commit.

### P-003 · Self-hosting guide

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** P-001 · **Chapters** 07
- **Acceptance**
  - `docs/self-hosting.md` lists every Cloudflare object in `apps/edge/wrangler.jsonc`,
    `apps/hosted/wrangler.jsonc` and `apps/web/wrangler.jsonc` (bindings, buckets, queues, DLQs,
    Durable Object, crons, vars with meaning, the `OPERATOR_TOKEN` secret), Postgres 18 with
    Hyperdrive, the migrate command, the deploy commands, and the route table of
    `ARCHITECTURE.md`.
  - A "last restore drill" line (filled by P-032).
  - `git grep -E -f <pattern list> docs/` finds nothing.

### P-004 · Repository CLAUDE.md

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** — · **Chapters** README
- **Acceptance**
  - `CLAUDE.md` at the root with layout, decisions (by reference to `docs/design/README.md`), every
    command of the README's *Repository CLAUDE.md* list, rules, and the secrets line.
  - Every command in it was run once and its result line is quoted in the issue.
  - Names no host, path or person outside the project.

### P-005 · Role agent files

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** P-004 · **Chapters** README
- **Acceptance**
  - `.claude/agents/{spec-editor,core-engineer,edge-engineer,hosted-engineer,web-engineer,ops-engineer,device-tester}.md`
    with frontmatter `name`, `description`, `model`, `effort`, `disallowedTools: Agent`, and the
    four parts (read first, where things are, building and testing, done).
  - Each file's owned paths equal the README's table.

### P-006 · A skipped Postgres test fails when the database is required

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** — · **Chapters** 03, 07
- **Acceptance**
  - With `PRODID_REQUIRE_DB=1` and no reachable database, `bun test apps/edge/test` exits non-zero
    naming the unreachable `DATABASE_URL`; without the variable it skips as today.
  - With a database, the edge test count printed equals the count when run locally with
    `bun run --filter '@prodid/db' up`.

### P-007 · Database checks that run against a given DATABASE_URL

- **Area** db · **Owner** ops-engineer · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - `bun run --filter '@prodid/db' check:ci` runs `test/smoke.ts` and `test/race.ts` against
    `DATABASE_URL` without `docker compose up`; `check` keeps its current behaviour.
  - Both pass against the compose database.

### P-008 · CI workflow

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-006, P-007 · **Chapters** 07
- **Acceptance**
  - `.github/workflows/check.yml` as chapter 07 *CI*: Postgres `18.6` service, bun from
    `packageManager`, actions pinned by SHA, `contents: read`, `PRODID_REQUIRE_DB=1`.
  - Steps `bun install --frozen-lockfile`, `bun run check`, web build,
    `bun run --filter '@prodid/db' check:ci`, all green on a pull request; the log shows the edge
    test count.
  - A pull request that breaks one edge test turns the run red.

### P-009 · Dependabot

- **Area** ops · **Owner** ops-engineer · **Priority** P2 · **Depends on** P-008 · **Chapters** 07
- **Acceptance**
  - `.github/dependabot.yml` for `bun` and `github-actions`, weekly, grouped.
  - Validated by `gh api` after the flip (the first update run is listed).

### P-010 · Package metadata

- **Area** ops · **Owner** ops-engineer · **Priority** P1 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - Every `package.json`: `license` (`CC0-1.0` for `spec`, `Apache-2.0` otherwise), `repository`
    with `directory`, `homepage`, `bugs`; `private: true` kept.
  - Only metadata fields change (`git diff` shows nothing else); `bun install --frozen-lockfile`
    and `bun run check` pass.

### P-011 · README for strangers

- **Area** docs · **Owner** spec-editor · **Priority** P0 · **Depends on** P-003 · **Chapters** 07
- **Acceptance**
  - Sections in order: what and why, status (the website's sentence), quick start, layout and
    licence table, links (spec, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/self-hosting.md`,
    prodid.org).
  - The quick start, run in a fresh clone, works as written; output quoted in the issue.

### P-012 · CONTRIBUTING.md

- **Area** docs · **Owner** spec-editor · **Priority** P0 · **Depends on** P-008 · **Chapters** 07
- **Acceptance**
  - Covers every point of chapter 07 *Community files › CONTRIBUTING.md*, including inbound =
    outbound per path and no CLA.
  - The commands in it match `package.json` scripts exactly.

### P-013 · CODE_OF_CONDUCT.md

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - Contributor Covenant 2.1 text, enforcement contact `hi@productdevbook.com`.

### P-014 · SECURITY.md

- **Area** docs · **Owner** spec-editor · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - Reporting through GitHub private vulnerability reporting; in-scope and out-of-scope lists from
    chapter 07; 7-day response.

### P-015 · Issue and pull request templates

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** P-014 · **Chapters** 07
- **Acceptance**
  - `.github/ISSUE_TEMPLATE/{bug,spec-change,publish-my-catalogue,report-publisher}.yml` and
    `config.yml` (blank issues off, security link), `.github/pull_request_template.md`, fields as
    chapter 07.
  - After the flip, `https://github.com/productdevbook/prodid/issues/new/choose` shows the four
    forms and the security link (screenshot).

### P-016 · ARCHITECTURE.md ownership for outside contributors

- **Area** docs · **Owner** spec-editor · **Priority** P2 · **Depends on** P-012 · **Chapters** 07
- **Acceptance**
  - *Repository layout and ownership* says "maintainers" for the coordinator and review roles and
    moves `db/migrations/` to edge as the README decides; nothing else in the file changes.

### P-017 · One honest status on the website

- **Area** web · **Owner** web-engineer · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - The status sentence is defined once in `apps/web/src/lib/spec.ts` and used by `/` `#status`,
    `/publish` `#checklist` and the footer, with the M1 text from chapter 07.
  - `publish.astro` no longer says nothing imports a Merchant file.
  - Screenshots of the three places, 360 px and 1280 px, light and dark.

### P-018 · Contact links on the website

- **Area** web · **Owner** web-engineer · **Priority** P1 · **Depends on** P-015 · **Chapters** 07
- **Acceptance**
  - Footer "Report a problem" → the issue chooser, "Security" → `SECURITY.md`; `#status`'s "say
    where it is wrong" links the chooser.
  - `astro build` passes its link check; screenshots of footer and `#status`.

### P-019 · Publish page: hosted routes are operator-assisted

- **Area** web · **Owner** web-engineer · **Priority** P1 · **Depends on** P-015 · **Chapters** 07
- **Acceptance**
  - `/publish` `#routes`, `#delegated` and `#hosted` say "Operator-assisted" and link the
    "Publish my catalogue" form instead of "Not available yet".
  - `spec:review` re-recorded only if a restated section changed; build passes; screenshots of the
    three sections.

### P-020 · GitHub settings for a public repository

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-008, P-014 · **Chapters** 07
- **Acceptance**
  - Topics set; private vulnerability reporting, secret scanning, push protection, Dependabot
    alerts and security updates on; Wiki, Discussions, Projects off.
  - After the flip: ruleset on `main` (no force push, no deletion, `check` required, owner bypass).
  - `gh api repos/productdevbook/prodid` and `gh api repos/productdevbook/prodid/rulesets` output
    quoted in the issue.

### P-021 · Make the repository public

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-001, P-002, P-006, P-007, P-008, P-011, P-012, P-014, P-017, P-020 · **Chapters** 07
- **Acceptance**
  - The owner's explicit OK is quoted in the issue.
  - `gh repo view productdevbook/prodid --json visibility` answers `PUBLIC`.
  - In a fresh container with no credentials: `git clone https://github.com/productdevbook/prodid`,
    `bun install --frozen-lockfile`, `bun run check` pass; output tail quoted.
  - `git log -p --all | grep -E -f <pattern list>` on that clone prints nothing.
  - The ruleset part of P-020 is applied and P-020 closed.

## M2 · Promises kept

### P-022 · Outgoing mail from notify@prodid.org

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** — · **Chapters** 02, 06
- **Acceptance**
  - Cloudflare Email Service sending enabled for `prodid.org`; SPF, DKIM and DMARC records
    published; `dig TXT` output quoted.
  - Queues `prodid-notify` and `prodid-notify-dlq` exist.
  - A test mail from a Worker binding reaches an external inbox with SPF, DKIM and DMARC `pass` in
    its headers (header excerpt quoted).

### P-023 · Spec: lapse notice and the stored contact

- **Area** spec · **Owner** spec-editor · **Priority** P0 · **Depends on** — · **Chapters** 02
- **Acceptance**
  - *Lapse* states: one notice per lapse to the `publisher.contact` of the last accepted document;
    what it contains and never contains (chapter 02); the contact is never shown in the status.
  - `spec:review` re-recorded for any restated section; `bun run check` and the web build pass.

### P-024 · Keep each source's contact

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-023 · **Chapters** 02, 04
- **Acceptance**
  - Migration `0002_source_contact.sql` adds `source.contact` and `source.notified_lapse_at`.
  - A successful crawl writes the accepted document's `publisher.contact`, or null; a failed crawl
    leaves it.
  - `/source/{name}` JSON and HTML never contain it (test).
  - `db/test/smoke.ts` covers the columns; `bun run check` and `check:ci` pass.

### P-025 · Send the lapse notice

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-022, P-024 · **Chapters** 02
- **Acceptance**
  - Setting `lapsed_at` enqueues `notify{source, lapsed_at}` in the same code path for both lapse
    kinds and for the sweep's seven-day lapse.
  - The consumer sends the mail of chapter 02 through `MAIL`, records `notified_lapse_at`, and
    skips when it already equals `lapsed_at`; three retries then `prodid-notify-dlq`, logged as
    `notify.dead-letter`.
  - Tests with a fake mailer: a definite negative, a seven-day transport failure, a source with no
    contact (no mail), a repeated lapse sweep (one mail), a cleared and new lapse (second mail),
    and a body containing no HTTP status or error text beyond the public status.

### P-026 · Blocking a hash withdraws its claims

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** — · **Chapters** 04
- **Acceptance**
  - Migration `0003_media_block_reason.sql` adds `media.blocked_reason`.
  - `blockMedia(sql, {sha256, reason, now})` withdraws every active `media` claim whose value's
    `sha256` matches, with `now`, in the same transaction; returns the count.
  - Test: an entity's media claim disappears from `/id/{opid}`, appears with `withdrawn_at` under
    `?history=1`, and a re-crawl of the same record does not bring it back.

### P-027 · `prodid-batch block-media`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-026 · **Chapters** 04
- **Acceptance**
  - The four steps of chapter 04 with the named environment variables; refuses to run without
    `DATABASE_URL` and prints the target host first.
  - Each step's result printed; a failed step exits non-zero and a second run completes it (test
    with fakes for R2 and the purge API).
  - In production on a canary image (after P-038): `media.prodid.org/sha256/<hex>` answers 410,
    `curl -I` output quoted.

### P-028 · No media dead letter is lost

- **Area** edge · **Owner** edge-engineer · **Priority** P1 · **Depends on** — · **Chapters** 03
- **Acceptance**
  - The edge Worker consumes `prodid-media-dlq` and logs `media.dead-letter` with the chapter 03
    fields; a media message deferred past the cap is sent there instead of dropped.
  - Tests for both paths in `apps/edge/test`.

### P-029 · Media only on media.prodid.org

- **Area** edge · **Owner** edge-engineer · **Priority** P1 · **Depends on** — · **Chapters** 05
- **Acceptance**
  - New var `MEDIA_HOST`; `/sha256/*` answers only on it, resolver routes answer `not-found` on it.
  - Tests for `prodid.org/sha256/<hex>` (404 problem) and `media.prodid.org/id/<opid>` (404).

### P-030 · Spec: the resolver allows cross-origin reads

- **Area** spec · **Owner** spec-editor · **Priority** P2 · **Depends on** — · **Chapters** 05
- **Acceptance**
  - *The resolver* states `Access-Control-Allow-Origin: *` on JSON answers of `/id`, `/01`,
    `/source` and `/schemas`.

### P-031 · Cross-origin headers on resolver JSON

- **Area** edge · **Owner** edge-engineer · **Priority** P2 · **Depends on** P-030 · **Chapters** 05
- **Acceptance**
  - The header on those JSON answers and their 304s, not on HTML; test per route.

### P-032 · Restore drill

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - A throwaway cluster bootstrapped from the production backups reaches Ready; `count(*)` of
    every table and `schema_migrations` equal production's at the backup time; the cluster is
    deleted.
  - Date and counts in the private ops notes; date in `docs/self-hosting.md`.

### P-033 · Backups on the barman-cloud plugin

- **Area** ops · **Owner** ops-engineer · **Priority** P1 · **Depends on** P-032 · **Chapters** 07
- **Acceptance**
  - The cluster backs up through the plugin; a backup completes and is listed; the restore drill
    passes again from a plugin backup.

### P-034 · Alerts for dead letters and Worker errors

- **Area** ops · **Owner** ops-engineer · **Priority** P2 · **Depends on** P-025, P-028 · **Chapters** 03, 07
- **Acceptance**
  - A forced `crawl.dead-letter` in production produces a mail to the owner, or the issue records
    that the platform offers no log-line alert and the canary (P-039) is the alarm.

## M3 · First publishers

### P-035 · `prodid-batch check`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P1 · **Depends on** — · **Chapters** 06
- **Acceptance**
  - Validates a discovery document or an NDJSON feed as chapter 06 says; one line per problem with
    its line number; non-zero exit on any; no token needed.
  - Run on every file in `spec/examples/` (all pass) and `spec/fixtures/ndjson/lines.ndjson`
    (reports exactly the lines in its `expected.json`).

### P-036 · Designed entity page

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** — · **Chapters** 05
- **Acceptance**
  - `renderEntity` produces the sections of chapter 05 in order, self-contained (no external
    request in the network log), light and dark, no horizontal scroll at 360 px.
  - Screenshots at 360 px and 1280 px, light and dark, for: an item with two sources disagreeing
    on `name`, an item with images and a PDF, a family with variants, `?history=1` with a withdrawn
    claim, a lapsed source's claim.
  - `view.test.ts` covers each section's presence.

### P-037 · Designed source and problem pages

- **Area** edge · **Owner** edge-engineer · **Priority** P1 · **Depends on** P-036 · **Chapters** 05
- **Acceptance**
  - `renderSource` and the problem page as chapter 05; screenshots of a healthy source, a lapsed
    one, `unknown-gtin` and `invalid-gtin`, at 360 px and 1280 px, light and dark.

### P-038 · The canary site in production

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - `prodid-batch publish canary spec/fixtures/merchant/feed.csv` with the fixture's declared
    language, markets and licence.
  - `https://prodid.org/source/canary.prodid.org` reports `success`; `https://prodid.org/01/<a
    fixture gtin>` answers the item with a claim from `canary.prodid.org`; one image served from
    `media.prodid.org`. Responses quoted; entity page screenshot on a phone width.

### P-039 · Canary workflow

- **Area** ops · **Owner** ops-engineer · **Priority** P1 · **Depends on** P-008, P-038 · **Chapters** 07
- **Acceptance**
  - `.github/workflows/canary.yml` every 30 minutes with the checks of chapter 07; opens or comments
    on one `incident` issue on failure.
  - A run with a deliberately wrong GTIN (workflow_dispatch input) opens the issue; a green run
    after it does not open another.

### P-040 · Route 1 in production: a domain serving its own document

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-038 · **Chapters** 02
- **Acceptance**
  - On the domain the owner supplies: `/.well-known/prodid.json` and one feed served, then
    `v=prodid0; host=<domain>` published, then a ping.
  - `/source/<domain>` shows `verified`, `verified_by` `dns-txt`, outcome `success`; one of its
    GTINs resolves. Responses quoted.

### P-041 · Route 2 in production: delegation and identity continuity

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-038 · **Chapters** 02, 06
- **Acceptance**
  - A slug published before its domain; its opids recorded; the domain's `_prodid` record pointed
    at the slug; after verify and the next crawl `/source/<domain>` is `verified` via `dns-txt` and
    `/source/<slug>.prodid.org` is 404; the recorded opids resolve unchanged.

### P-042 · Operator runbook

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** P-027, P-035 · **Chapters** 04, 06
- **Acceptance**
  - `docs/operating.md`: onboarding from a "Publish my catalogue" issue with `prodid-batch publish`,
    verify, show, remove; takedown with `block-media`; reading dead-letter logs; what to tell a
    lapsed publisher. Each command was run (against production or a local stack) and its output
    shape shown.

### P-043 · Website after M3

- **Area** web · **Owner** web-engineer · **Priority** P1 · **Depends on** P-035, P-040 · **Chapters** 07
- **Acceptance**
  - `#checklist` tells a self-publisher to run `prodid-batch check`; the status sentence is the
    M3 text; screenshots.

### P-044 · The first outside catalogue

- **Area** ops · **Owner** ops-engineer · **Priority** P1 · **Depends on** P-032, P-036, P-041, P-042 · **Chapters** 06
- **Acceptance**
  - A publisher's "Publish my catalogue" issue handled with the runbook; their
    `/source/<name>` reports `success`; one of their GTINs resolves; the issue is closed with the
    links.

## M4 · Self-service hosting

### P-045 · ARCHITECTURE: self-service on publish.prodid.org

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** — · **Chapters** 06
- **Acceptance**
  - *Routing* and the hosted paragraphs say `publish.prodid.org` also serves self-service pages
    and that the accounts database belongs to the hosted Worker alone.

### P-046 · Cloudflare objects for self-service

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-022 · **Chapters** 06
- **Acceptance**
  - D1 database `prodid-hosted-accounts`, a Turnstile widget for `publish.prodid.org`, mail sending
    available to the hosted Worker; ids handed to hosted-engineer, secrets set with
    `wrangler secret put`, none printed.

### P-047 · Accounts database and bindings in the hosted Worker

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-046 · **Chapters** 06
- **Acceptance**
  - `apps/hosted/migrations/0001_accounts.sql` with the three tables of chapter 06; bindings
    `ACCOUNTS`, `MAIL`, Turnstile secret in `wrangler.jsonc`; `cf-typegen` regenerated.
  - Tests run against a local D1 (`wrangler`'s or an in-memory fake), not production.

### P-048 · Sign in by email link

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-047 · **Chapters** 06
- **Acceptance**
  - Screens 1 and 2 of chapter 06; link single use, 15 minutes, hash stored; session cookie
    attributes exact; per-email and per-address limits; Turnstile checked server-side; CSRF token
    and `Origin` check on every POST.
  - Tests: expired link, reused link, rate limit, missing Turnstile, cross-origin POST refused.
  - Screenshots of both screens and the expired-link state, 360 px, light and dark.

### P-049 · Your sites and new site

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-048 · **Chapters** 06
- **Acceptance**
  - Screens 3 and 4; `site.json` gains `owner`; `GET /slug-check` answers `{ok, reason}` from
    `checkSlug`; at most 5 sites; a slug held after deletion is refused.
  - Tests for ownership (another account's site is 404), the limit, and slug errors.
  - Screenshots of an empty list, a list with sites, and a refused slug.

### P-050 · Upload a Merchant file or a feed

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - Screen 5.3: `.csv`/`.tsv` converted in the Worker with `importMerchantRow`, `.ndjson` stored
    after validation; result shows items written and skipped rows with row numbers and reasons.
  - Uploading `spec/fixtures/merchant/feed.csv` with its declared values stores exactly
    `spec/fixtures/merchant/feed.ndjson` and reports row 6 skipped (test).
  - Screenshot of the result panel.

### P-051 · Connect a domain

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - Screen 5.4: the exact TXT record shown; "Check now" runs `verifySite`, at most once a minute,
    and shows the TXT values found; removing the domain unverifies the site.
  - Tests with a fake DoH for: no record, a record to another host, the right record, SERVFAIL.

### P-052 · Site status and settings

- **Area** hosted · **Owner** hosted-engineer · **Priority** P1 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - Screen 5.1 reads `https://prodid.org/source/<name>` over public HTTPS (no shared binding) and
    shows "not crawled yet" on 404; screen 5.5 edits name, contact and licence.
  - Screenshots of a crawled and a not-yet-crawled site.

### P-053 · Export everything

- **Area** hosted · **Owner** hosted-engineer · **Priority** P1 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - Screen 5.6: a zip with `site.json` and every feed, byte-identical to R2 (test).

### P-054 · Delete a site or an account

- **Area** hosted · **Owner** hosted-engineer · **Priority** P1 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - Screen 5.7 with typed confirmation and the stated consequences; the slug is held 30 days;
    screen 6 deletes an account that owns no site.
  - Tests: wrong confirmation refused, slug held, held slug released after 30 days.

### P-055 · Release unused slugs

- **Area** hosted · **Owner** hosted-engineer · **Priority** P2 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - The daily cron mails a reminder at day 23 and releases a site with no feed at day 30 (test with
    a clock).

### P-056 · `prodid-batch assign`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P2 · **Depends on** P-049 · **Chapters** 06
- **Acceptance**
  - `prodid-batch assign <slug> <email>` sets `owner` on an operator-created site, creating the
    account if needed; the owner then sees it in `/sites` (test).

### P-057 · Website points at self-service

- **Area** web · **Owner** web-engineer · **Priority** P0 · **Depends on** P-050, P-051 · **Chapters** 07
- **Acceptance**
  - Routes 2 and 3 link `https://publish.prodid.org/`; status sentence is the M4 text;
    screenshots.

### P-058 · Retire the "Publish my catalogue" form

- **Area** docs · **Owner** spec-editor · **Priority** P2 · **Depends on** P-057 · **Chapters** 07
- **Acceptance**
  - The form is removed from `.github/ISSUE_TEMPLATE/`, `config.yml` links `publish.prodid.org`
    instead; `docs/operating.md` updated.

## M5 · Open data

### P-059 · Spec: dumps

- **Area** spec · **Owner** spec-editor · **Priority** P0 · **Depends on** — · **Chapters** 04
- **Acceptance**
  - A *Dumps* section with the files, fields, exclusions, licences and retention of chapter 04;
    `spec/schemas/org.prodid.dump.json`; an example manifest; invalid fixtures with
    `expected.json` entries; `bun run check` validates them.

### P-060 · Core: the dump manifest

- **Area** core · **Owner** core-engineer · **Priority** P1 · **Depends on** P-059 · **Chapters** 04
- **Acceptance**
  - `validateDump` and its types generated like the others; `schema-drift.test.ts` covers them.

### P-061 · Store: snapshot export

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-059 · **Chapters** 04
- **Acceptance**
  - `packages/store` exports async iterators per dump file over one `repeatable read` transaction,
    producing exactly the chapter 04 fields and none of its exclusions (test asserts the absence of
    `contact`, `id`, `error`, `reason`, `decided_by`, `blocked_reason`).

### P-062 · `prodid-batch dump`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-060, P-061 · **Chapters** 04
- **Acceptance**
  - Writes the gzip NDJSON files and the manifest to a directory or to R2 over S3 multipart,
    manifest and `latest.json` last; prints lines, bytes and elapsed time per file.
  - Output validates against `org.prodid.dump`; a run against the canary-sized local stack quoted.

### P-063 · Store: load a dump

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-061 · **Chapters** 04
- **Acceptance**
  - Loads every dump file into an empty migrated database, assigning new source ids and keeping
    every `opid`; refuses a non-empty database.

### P-064 · `prodid-batch load-dump` and the replaceability test

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-062, P-063 · **Chapters** 04
- **Acceptance**
  - Test: crawl fixtures into database A, dump, load into database B; every `/id/{opid}?history=1`
    answers identically from both; a re-crawl of the same feed against B mints no new entity.

### P-065 · Dumps in production

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-062 · **Chapters** 04, 07
- **Acceptance**
  - Bucket `prodid-dumps` on `dumps.prodid.org`; lifecycle rules implement the retention; nightly
    04:30 UTC job in the private ops manifests; the canary checks `latest.json` age.
  - `curl https://dumps.prodid.org/v0/latest.json` after the first night quoted.

### P-066 · Serve the dump schema

- **Area** edge · **Owner** edge-engineer · **Priority** P2 · **Depends on** P-059 · **Chapters** 05
- **Acceptance**
  - `GET /schemas/v0/org.prodid.dump.json` answers like the other schemas (test).

### P-067 · The /data page

- **Area** web · **Owner** web-engineer · **Priority** P1 · **Depends on** P-065 · **Chapters** 07
- **Acceptance**
  - `/data` as chapter 07, in the sitemap and the header nav; screenshots at 360 and 1280 px,
    light and dark.

## M6 · Datasets and matching

### P-068 · Spec: dataset sources

- **Area** spec · **Owner** spec-editor · **Priority** P0 · **Depends on** — · **Chapters** 04
- **Acceptance**
  - Sources of kind `dataset` named `dataset:<slug>`, always `unverified`; status `via` gains
    `import`; schema and fixtures updated; `bun run check` passes.

### P-069 · Store: the dataset import path

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-068 · **Chapters** 04
- **Acceptance**
  - Migration `0004_dataset_import.sql`; an import writes records through the crawl's ingest with
    `feed = null`, one `crawl` row with `via = 'import'`, and withdraws absent keys on a full import.
  - Tests: first import, re-import unchanged (no claim churn), re-import with one key gone.

### P-070 · Core: the Wikidata mapping

- **Area** core · **Owner** core-engineer · **Priority** P0 · **Depends on** P-068 · **Chapters** 04
- **Acceptance**
  - `packages/core/src/datasets/wikidata.ts`, pure; property ids confirmed against wikidata.org
    and written back to chapter 04 as an as-built note; fixtures in `spec/fixtures/datasets/wikidata/`
    with input entities and expected records, including skipped ones.

### P-071 · `prodid-batch import`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-069, P-070 · **Chapters** 04
- **Acceptance**
  - `prodid-batch import wikidata <file>` streams the export, prints records written, skipped with
    reasons, withdrawn, and elapsed time; refuses without `DATABASE_URL`.

### P-072 · Wikidata in production

- **Area** ops · **Owner** ops-engineer · **Priority** P1 · **Depends on** P-071, P-032 · **Chapters** 04
- **Acceptance**
  - One import in production; `/source/dataset:wikidata` reports it; one Wikidata GTIN resolves
    with a claim from `dataset:wikidata`; counts quoted.

### P-073 · `prodid-batch merge` and `unmerge`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P1 · **Depends on** — · **Chapters** 04
- **Acceptance**
  - The commands of chapter 04 over `mergeEntities` and `revertMerge`; tests: merge, the 308 and
    `merged_from`, unmerge restores both, refusing different kinds, missing `PRODID_OPERATOR` or
    reason.

### P-074 · Store: merge candidates

- **Area** edge · **Owner** edge-engineer · **Priority** P2 · **Depends on** — · **Chapters** 04
- **Acceptance**
  - A read-only query returning the pairs of chapter 04; test with two sources publishing the same
    brand and name without a shared identifier.

### P-075 · `prodid-batch candidates`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P2 · **Depends on** P-074 · **Chapters** 04
- **Acceptance**
  - One line per pair with both opids and both sources; `--limit`.

## M7 · Authoritative brands

### P-076 · Spec: authoritative evidence

- **Area** spec · **Owner** spec-editor · **Priority** P0 · **Depends on** — · **Chapters** 04
- **Acceptance**
  - *Trust* states the evidence rule, the per-brand revocable grant, and that losing verification
    drops the trust without operator action.

### P-077 · Store: authority grants

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-076 · **Chapters** 04
- **Acceptance**
  - Migration `0005_authority.sql`; grant and revoke functions; status and claims show
    `authoritative` exactly while verified with an un-revoked grant (tests: grant, revoke, lapse).

### P-078 · `prodid-batch grant-authority` and `revoke-authority`

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-077 · **Chapters** 04
- **Acceptance**
  - Both commands with required evidence or reason and `PRODID_OPERATOR`; tests.

### P-079 · Website: authoritative explained

- **Area** web · **Owner** web-engineer · **Priority** P1 · **Depends on** P-076 · **Chapters** 07
- **Acceptance**
  - `/publish` `#trust` explains how a brand owner asks for it (an issue form or mail, decided in
    the M7 decision issue); `spec:review` re-recorded; screenshots.

## M8 · Spec v1

### P-080 · Spec v1: the delta from v0

- **Area** spec · **Owner** spec-editor · **Priority** P0 · **Depends on** — · **Chapters** 07
- **Acceptance**
  - `spec/v1-from-v0.md` lists every change, the TXT version decision, and how long v0 documents
    are accepted; every open question in the spec closed or carried explicitly.

### P-081 · Schemas and fixtures v1

- **Area** spec · **Owner** spec-editor · **Priority** P0 · **Depends on** P-080 · **Chapters** 07
- **Acceptance**
  - `$id`s under `/schemas/v1/`, `version` constants, fixtures updated; v0 schemas kept;
    `bun run check` passes.

### P-082 · Core reads v0 and v1

- **Area** core · **Owner** core-engineer · **Priority** P0 · **Depends on** P-081 · **Chapters** 07
- **Acceptance**
  - Validators for both versions; a v0 document is accepted until the date in P-080 and refused
    after it (test with a clock).

### P-083 · Edge on v1

- **Area** edge · **Owner** edge-engineer · **Priority** P0 · **Depends on** P-082 · **Chapters** 05, 07
- **Acceptance**
  - Crawls both versions; serves `/schemas/v1/*`; resolver documents carry v1 `$type`/`version`;
    tests.
  - Deployed before P-084's hosted deploy: a crawler that knows only v0 refuses a v1 document.

### P-084 · Hosted writes v1 documents

- **Area** hosted · **Owner** hosted-engineer · **Priority** P0 · **Depends on** P-082 · **Chapters** 04, 06
- **Acceptance**
  - Served discovery documents are v1; existing sites switch without operator action; tests.
  - `prodid-batch dump` writes v1 dumps under `v1/` and keeps applying retention under `v0/`;
    `prodid-batch load-dump` loads a v0 and a v1 dump; tests.

### P-085 · `@prodid/core` buildable for npm

- **Area** core · **Owner** core-engineer · **Priority** P0 · **Depends on** P-082 · **Chapters** 07
- **Acceptance**
  - `bun run --filter '@prodid/core' build` emits ESM and `.d.ts` into `dist/` with the generated
    validators; `exports` point at `dist/`; `npm pack --dry-run` lists only `dist/`, `README.md`,
    `LICENSE`; a scratch project imports it under Node and bun.

### P-086 · Release workflow

- **Area** ops · **Owner** ops-engineer · **Priority** P0 · **Depends on** P-085 · **Chapters** 07
- **Acceptance**
  - `.github/workflows/release.yml` on tags `core-v*`/`spec-v*` publishes with npm provenance via
    trusted publishing; no npm token stored; a dry run on a pre-release tag is shown.

### P-087 · `@prodid/spec` on npm

- **Area** ops · **Owner** ops-engineer · **Priority** P1 · **Depends on** P-086 · **Chapters** 07
- **Acceptance**
  - The package carries schemas, examples, fixtures and `expected.json`, licence `CC0-1.0`;
    published from `spec-v1.0.0`.

### P-088 · Writing a conformance runner

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** P-087 · **Chapters** 07
- **Acceptance**
  - A *Conformance* addition in the spec explaining each vector format and how to run them in
    another language, with the `expected.json` semantics.

### P-089 · CHANGELOG and the 1.0.0 tags

- **Area** docs · **Owner** spec-editor · **Priority** P1 · **Depends on** P-083, P-084, P-086 · **Chapters** 07
- **Acceptance**
  - `CHANGELOG.md` with the 1.0.0 section; tags `spec-v1.0.0` and `core-v1.0.0` pushed by the
    orchestrator; both packages on npm with provenance (`npm view` output quoted).

### P-090 · Website on v1

- **Area** web · **Owner** web-engineer · **Priority** P1 · **Depends on** P-089 · **Chapters** 07
- **Acceptance**
  - Status sentence and footer say spec v1; schema links point at `/schemas/v1/`; `/spec` renders
    v1; screenshots.

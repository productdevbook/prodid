# 07 · Project and operations

The website, the repository as a public open-source project, CI, deployment, the production
database and releases.

## Website

`apps/web`, static Astro on Workers Static Assets.

- **[Exists]** `/`: hero with resolver demo, `#problem`, `#model`, `#how`, `#claims`, `#who`,
  `#status`. `/publish`: header, `#discovery`, `#routes`, `#own-domain` (steps 1–4), `#delegated`,
  `#hosted`, `#trust`, `#after`, `#checklist`. `/spec` renders `spec/README.md` with a sticky TOC;
  `/spec/...` lists schemas, examples and fixtures. `404`, `robots.txt`, `sitemap.xml`. Theme toggle
  (`localStorage.theme`, applied before first paint). No analytics.
- **[Exists]** The build fails on any broken internal link or fragment, and on drift of the 26 spec
  sections the pages restate (`spec-review.json`, re-recorded with `spec:review <anchor>`).
- **[Change]** Status text contradicts itself and the code: `index.astro` `#status` says crawler and
  hosted publishing are "Live", `publish.astro` `#checklist` says "the index is not running yet",
  the footer says "reference implementation live", and `publish.astro` says nothing imports a
  Merchant file. One status, defined once in `apps/web/src/lib/spec.ts` and used by all three
  places, matching the milestone shipped:
  - after M1: "Spec v0 draft. The index and the hosted publisher run on prodid.org. Hosting is
    operator-assisted. No catalogue is published yet."
  - after M3: "… First catalogues are published; hosting is operator-assisted."
  - after M4: "… Anyone can publish, on their own domain or hosted."
- **[Change]** Routes 2 and 3 on `/publish` say "Not available yet" although the code exists and is
  only operator-gated. Until M4 they say "Operator-assisted" and link the GitHub issue form
  "Publish my catalogue"; from M4 they link `publish.prodid.org`.
- **[New]** Contact: the footer gains "Report a problem" (GitHub issue chooser) and "Security"
  (`SECURITY.md`). `#status`'s "say where it is wrong" links the same chooser.
- **[New]** `/publish` `#checklist` tells a self-publisher to run `prodid-batch check` (chapter 06)
  before pinging.
- **[New]** `/data` (M5): the latest dump from `https://dumps.prodid.org/v0/latest.json` fetched at
  build time and linked, what each file holds, the licence rule, how to load it.

## Public repository

The repository is private today and is to become public. Nothing in it or its 15 commits is a
credential. What must not be public is infrastructure detail.

### What leaves the tree

- **[Change]** `db/k8s/` (README and five manifests) describes the shared production node: its
  name, capacity, other tenants and their backup windows, its public IP (in
  `60-networkpolicy.yaml`), the Cloudflare account id (in the R2 endpoint), the private ops path,
  and the tunnel and Access topology. It moves to the private ops location, unchanged, and leaves
  the repository. A copy is made and checked before anything is removed.
- **[New]** `docs/self-hosting.md` takes its place: what an index needs, named only by role —
  Postgres 18 with the migrations applied, Hyperdrive in front of it, the R2 buckets
  `prodid-media` (edge), `prodid-hosted` (hosted), the queues and DLQs and the Durable Object of
  `apps/edge/wrangler.jsonc`, the secret `OPERATOR_TOKEN`, the vars and what each means, how to
  migrate (`bun run --filter '@prodid/db' migrate` with `DATABASE_URL`), the deploy commands and
  the route table of `ARCHITECTURE.md`. No hostnames other than the project's public ones.
- **[Exists, kept]** The Hyperdrive config id in `apps/edge/wrangler.jsonc`: unusable without the
  Access service token, and Wrangler needs it in the file.

### History

- **[New]** The tree change does not remove what history holds. Before the repository is public,
  history is rewritten once with `git filter-repo`:
  1. `git bundle create <ops location>/prodid-before-public.bundle --all`, verified with
     `git bundle verify`;
  2. `--path db/k8s --invert-paths`;
  3. `--replace-text` for any remaining occurrence of the node name, the node IP, the account id
     and the ops path (the expression list lives with the bundle, not in the repository);
  4. `--replace-message` for the same in commit messages (13d5c7b names the node);
  5. check: `git log -p --all` and `git log --all --format=%B` contain none of them;
     `bun run check` passes on the rewritten `main`;
  6. force-push `main` to the still-private GitHub repository.
  This is one-way and needs the owner's explicit OK at that moment. After the repository is public
  it is never done again.
- **[Exists, kept]** All commits are authored as `productdevbook <hi@productdevbook.com>`; that
  address becomes public with the history.

### Community files

**[New]**, at the root unless noted:

- `README.md` for strangers: one-paragraph what and why; status (the website's sentence); quick
  start (`bun install --frozen-lockfile`, `bun run check`; with Docker
  `bun run --filter '@prodid/db' up` and `bun run check:db`; the edge tests run only when
  `DATABASE_URL` reaches a database);
  layout and licence table (kept); links to the spec, `ARCHITECTURE.md`, `CONTRIBUTING.md`,
  `docs/self-hosting.md`, prodid.org.
- `CONTRIBUTING.md`: the spec-first rule (pillar 6); `bun run check` is the gate and CI runs it with
  Postgres; ownership by path from `ARCHITECTURE.md`, written for outside contributors (the
  "coordinator" and "review member" become "maintainers"); Conventional Commits; English only; no
  comments unless the code cannot say it; latest stable versions; how to add a fixture; how to
  re-record spec-review; contributions are under the licence of the path (CC0 for `spec/`,
  Apache-2.0 elsewhere), inbound = outbound, no CLA.
- `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1, enforcement contact `hi@productdevbook.com`.
- `SECURITY.md`: report through GitHub private vulnerability reporting; in scope: the crawler's
  fetch guard and limits (SSRF, amplification), discovery and identity takeover, media serving,
  the hosted publisher's auth and uploads, the status page as a probe; out of scope: the trust
  model's stated limits (spec *Security considerations*); response within 7 days.
- `.github/ISSUE_TEMPLATE/`: `bug.yml`, `spec-change.yml` (which section, the change, fixtures
  affected), `publish-my-catalogue.yml` (until M4: slug wanted, publisher name, contact, licence,
  file attached or linked, domain if any), `report-publisher.yml`, `config.yml` (blank issues off,
  security link).
- `.github/pull_request_template.md`: what and why, `Refs #`, spec touched yes/no, `bun run check`
  output pasted.
- `package.json` metadata: `license` (`CC0-1.0` for `spec`, `Apache-2.0` for every other package),
  `repository` (with `directory`), `homepage`, `bugs`. Packages stay `private: true` until M8.
- No `NOTICE` file: nothing bundled requires one.

### CI

**[New]** `.github/workflows/check.yml`, on pull requests and pushes to `main`:

- `ubuntu-latest`, `permissions: contents: read`, every action pinned by commit SHA.
- `oven-sh/setup-bun` with the version in `packageManager` (`bun@1.4.2`).
- Service `postgres:18.6` (the production image's major and minor), `POSTGRES_USER/PASSWORD/DB =
  prodid`, health-checked; `DATABASE_URL=postgres://prodid:prodid@localhost:5432/prodid`.
- Steps: `bun install --frozen-lockfile`; `bun run check`; `bun run --filter '@prodid/web' build`
  (link and spec-drift checks); `bun run --filter '@prodid/db' check:ci` (new script: smoke and race
  against `DATABASE_URL`, without `docker compose up`).
- `PRODID_REQUIRE_DB=1` makes a Postgres-backed test file that would skip fail instead
  (`@prodid/store/testing`), so a broken service cannot turn into a green run with the edge tests
  missing.
- `.github/dependabot.yml`: `bun` and `github-actions`, weekly, grouped; every bump still follows
  the latest-stable rule and passes CI.

Deployment stays manual (`wrangler deploy` by the owner). No Cloudflare credential is stored in
GitHub.

### GitHub settings at the flip

**[New]** Description and homepage kept; topics `product-data`, `gtin`, `gs1-digital-link`,
`open-data`, `product-identifiers`, `cloudflare-workers`, `postgresql`, `typescript`. Private
vulnerability reporting, secret scanning and push protection, Dependabot alerts and security
updates on. A ruleset on `main`: no force push, no deletion, status check `check` required, owner
may bypass. Wiki, Discussions and Projects off. The labels `area:*`, `agent:*` and `P0`–`P3` are
created with the milestones and issues; the default labels stay.

## Production operations

- **[Exists]** One CloudNativePG instance, PostgreSQL 18.6, 40 GiB volume that cannot grow, daily
  backup to R2 at 03:30 with 30-day retention, migrations by hand over a port-forward.
- **[New]** Restore drill, run once before the first real publisher and after any change to the
  backup credentials: bootstrap a throwaway cluster from the backups, compare `count(*)` of every
  table and `schema_migrations` with production, delete it; record the date and the counts in the
  private ops notes and the date in `docs/self-hosting.md`'s "last drill" line.
- **[New]** Move backups from the in-tree `barmanObjectStore` (deprecated in CNPG 1.30, removed in
  1.31) to the barman-cloud plugin before the operator is upgraded, then run the drill again.
- **[New]** Canary: hosted slug `canary`, published with the spec's Merchant fixture through the
  operator CLI. A scheduled GitHub Actions workflow every 30 minutes checks
  `https://prodid.org/01/<fixture gtin>` answers 200 with a claim from `canary.prodid.org`, and
  `https://prodid.org/source/canary.prodid.org` has a last crawl younger than 12 hours with outcome
  `success`; on failure it opens (or comments on) one issue labelled `incident`.
- **[New]** Dead letters and Worker errors alert the owner by mail through Cloudflare's
  notifications on the edge Worker's logs. If the account offers no alert on log lines, the
  as-built note says so and the canary is the alarm.
- **[New]** Nightly `prodid-batch dump` at 04:30 UTC next to Postgres, scheduled in the private ops
  manifests; the canary also checks `latest.json` is younger than 30 hours once dumps exist.

## Releases

- **[Exists]** The spec is "v0 draft"; nothing is versioned or published to a registry.
- **[New]** M8 freezes the spec as v1: schemas under `/schemas/v1/`, `$id`s and `version` constants
  changed, the TXT version decided (owner), a migration note from v0, and tags `spec-v1.0.0` and
  `core-v1.0.0`.
- **[New]** `@prodid/core` on npm (Apache-2.0): compiled ESM and `.d.ts`, the generated validators
  included, published from a tag by GitHub Actions with npm provenance; semver from 1.0.0.
- **[New]** `@prodid/spec` on npm (CC0-1.0): schemas, examples and all fixtures with
  `expected.json`, so another implementation can run the vectors without cloning; README section
  on writing a conformance runner in another language.
- **[New]** `CHANGELOG.md` from 1.0.0, one section per tag.

## As built

- The canary feed is a private copy of the spec's Merchant fixture with one `image_link` on
  `https://prodid.org/canary/item.png` (`apps/web/public/canary/item.png`, a 256 × 256 PNG). The
  fixture's own images are on `acme.example`, which never resolves, and the index refuses SVG, so
  without the copy no canary image reaches `media.prodid.org`.
- At M4 the "Publish my catalogue" issue form was removed (P-058). `config.yml` keeps blank issues
  off and lists two contact links: "Publish my catalogue" to `https://publish.prodid.org/` and the
  security link. `docs/operating.md` keeps the operator's hosting commands for the exceptions
  self-service does not cover, with `prodid-batch assign` to hand a CLI-made site to its
  publisher's account.

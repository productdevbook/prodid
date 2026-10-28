# Contributing to prodid

Thank you for helping. This file is what a pull request is checked against.

Questions, bugs and proposals go through the
[issue forms](https://github.com/productdevbook/prodid/issues/new/choose). Security problems do
not: report them privately as [`SECURITY.md`](SECURITY.md) says. Everyone taking part follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## The spec leads

The protocol is normative in [`spec/README.md`](spec/README.md); the code implements it. A rule
changes in `spec/` (text, schema and fixtures) before or with the code that follows it, never
after, so that two implementations can agree on the vectors. A pull request that changes behaviour
the spec describes and leaves `spec/` alone is not ready.

The design in [`docs/design/`](docs/design/README.md) says what exists, what changes and what is
new, and its *Decisions* table is settled. To propose a different rule, open a "Spec change"
issue first.

## The gate: `bun run check`

```sh
bun install --frozen-lockfile
bun run check
```

`bun run check` at the repository root is the truth: it regenerates the validators, then runs
format, lint, typecheck, the tests and the spec fixtures. Nothing is reported working unless it
ran, and a pull request includes its output.

The database-backed tests in it run when a Postgres answers at `DATABASE_URL` (else the value in
`db/.env`, else `db/.env.example`) and skip otherwise. To run them locally, with Docker:

```sh
bun run --filter '@prodid/db' up
DATABASE_URL=postgres://prodid:prodid@127.0.0.1:54329/prodid bun run check:db
```

`bun run check:db` runs the Postgres smoke and race tests, each in a throwaway database.

CI (`.github/workflows/check.yml`, job `check`) runs on every pull request and every push to
`main`, with a `postgres:18.6` service and `PRODID_REQUIRE_DB=1`, so a database-backed test file
that would skip fails instead. Its steps:

```sh
bun install --frozen-lockfile
bun run check
bun run --filter '@prodid/web' build
bun run --filter '@prodid/db' check:ci
```

`bun run --filter '@prodid/web' build` checks every internal link and fragment of the website and
that the spec sections it restates have not drifted. `bun run --filter '@prodid/db' check:ci` runs
the smoke and race tests against `DATABASE_URL` without starting a container.

`bun run format` fixes formatting.

## Who owns what

Every path has one owner, in the table *Repository layout and ownership* of
[`ARCHITECTURE.md`](ARCHITECTURE.md#repository-layout-and-ownership). The owners are the project's
maintainers. Anyone can propose a change anywhere; a pull request is reviewed by the maintainers
of each path it touches, and a change that spans several owners is easier to review split by path.
A maintainer re-runs every check before merging and audits the change against the spec and
`ARCHITECTURE.md`.

## Rules

- **Conventional Commits.** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`,
  `build:`, `style:`, `perf:`. The message says what was done and why; a commit for an issue ends
  with `Refs #<n>`.
- **English only**: code, identifiers, messages, documents.
- **No comments unless the code cannot say it**: a constraint that reads as wrong until explained,
  an outside system's odd behaviour, why a choice was made. Never a comment restating the code.
- **Latest stable versions** of everything: runtime, database, libraries, `compatibility_date`.
  Verify against the registry (`npm view`, image tags, release pages) before pinning; never pin
  from memory.

## Adding a fixture

A new rule gets its fixtures in the same commit.

- A record that must validate goes in `spec/fixtures/valid/`, one that must be rejected in
  `spec/fixtures/invalid/`, each named `<type>.<case>.json` (`entity.claim-no-source.json`). The
  schema is chosen by the record's `$type`.
- Every invalid fixture has an entry in `spec/fixtures/expected.json`, keyed by its file name,
  naming the `instancePath` and `keyword` that must reject it and, where it disambiguates,
  `params`. An invalid fixture rejected for any other reason fails the check. It carries one
  defect.
- The vector sets `spec/fixtures/txt/`, `gtin/`, `brand/` and `ndjson/` have the formats the
  spec states where it defines each rule.
- The Merchant fixture is derived: after changing the mapping, `bun spec/validate.ts --emit-merchant`
  rewrites the expected NDJSON.
- After a schema change, `bun run --filter '@prodid/core' build` regenerates the validators
  (`bun run check` does it too).

`bun run --filter '@prodid/spec' check` runs the spec's examples and fixtures alone.

## Re-recording spec-review

The website restates some spec sections in its own words. `apps/web/spec-review.json` records a
hash of each, and the website build fails when one changes. After changing such a section, read
the diff, fix the page that restates it, then re-record that section by its anchor:

```sh
bun run --filter '@prodid/web' spec:review <anchor>
```

Re-recording says someone read the section and checked the page, so name only the sections you
reviewed.

## Licence

A contribution is made under the licence of the path it changes: **CC0-1.0** for `spec/`,
**Apache-2.0** for everything else. Inbound is outbound: what you contribute is licensed to
everyone on the same terms the project licenses it to you. There is no contributor licence
agreement to sign.

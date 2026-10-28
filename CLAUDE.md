# prodid

An open identity and data layer for physical products. The protocol is normative in
[`spec/README.md`](spec/README.md); the reference implementation's contract is
[`ARCHITECTURE.md`](ARCHITECTURE.md); the design, roadmap and backlog are in
[`docs/design/`](docs/design/README.md). Read the chapter an issue names before working on it.

## Layout

The table in `ARCHITECTURE.md` (*Repository layout and ownership*), with the owners of the
working model in [`docs/design/README.md`](docs/design/README.md):

| path | contents | owner |
| --- | --- | --- |
| `spec/` | specification, JSON Schemas, examples, fixtures (CC0) | `spec-editor` |
| `docs/design/`, `ARCHITECTURE.md`, README and community files | design chapters, roadmap, backlog, project documents | `spec-editor` |
| root workspace files, `packages/core/` | pure TypeScript, no I/O: GTIN, opid, record validation, NDJSON, discovery rules | `core-engineer` |
| `packages/store/`, `apps/edge/`, `db/migrations/` | SQL access, the index Worker, the SQL migrations | `edge-engineer` |
| `apps/hosted/`, `apps/batch/` | the hosted publisher Worker, the operator CLI | `hosted-engineer` |
| `apps/web/` | the prodid.org website | `web-engineer` |
| `db/` except `migrations/`, `.github/` | dev Postgres (`compose.yaml`), migrate script, database tests, CI | `ops-engineer` |

An owner changes only its own paths. Everything outside `spec/` is Apache-2.0.

## Decisions

The *Decisions* table in [`docs/design/README.md`](docs/design/README.md) is settled. To change a
rule, change the design chapter first; to change the protocol, change `spec/` (text, schema,
fixtures) before or with the code.

## Commands

- `bun install --frozen-lockfile`
- `bun run check`: format, lint, typecheck, tests, spec fixtures. This is the truth; nothing is
  reported working unless it ran. The database-backed tests in it run when the dev Postgres is
  reachable (`DATABASE_URL`, else `db/.env`, else `db/.env.example`) and skip otherwise.
- `bun run --filter '@prodid/db' up`, then `bun run check:db`: Postgres smoke and race tests, each
  in a throwaway database. `check:db` needs `DATABASE_URL` in the environment; the dev value is in
  `db/.env.example`.
- `bun run --filter '@prodid/db' migrate`, with `DATABASE_URL`.
- `bun run --filter '@prodid/core' build`: regenerates the validators from `spec/schemas/`.
- `bun spec/validate.ts --emit-merchant`: regenerates the Merchant fixture.
- `bun run --filter '@prodid/web' spec:review <anchor>…`: re-records reviewed spec sections the
  website restates.
- `bun run --filter '@prodid/edge' cf-typegen` and `bun run --filter '@prodid/hosted' cf-typegen`:
  regenerate `worker-configuration.d.ts` from `wrangler.jsonc`.
- Deploy: `bunx wrangler deploy` in `apps/edge`, `apps/hosted`, and `apps/web` after
  `bun run --filter '@prodid/web' build`. Routes are attached at deploy time.
  `bunx wrangler deploy --dry-run` bundles without uploading.

## Rules

- The *Rules* section of `ARCHITECTURE.md`: latest stable versions, `bun run check` is the truth,
  English only, no comments unless the code cannot say it.
- Commits are Conventional Commits and end with `Refs #<n>`. Never `git add -A`.
- This file and `.claude/agents/*.md` are public: they name no host, path or person outside the
  project.

## Secrets

Secrets live outside the repository. Agents read them from files and never print them.

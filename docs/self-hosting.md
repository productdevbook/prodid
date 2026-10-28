# Self-hosting

What it takes to run the reference implementation yourself: a Postgres database and a Cloudflare
account with three Workers. The index is replaceable by design; this is the list of everything
prodid.org runs, so anyone can run the same.

Every name below is the one in the repository's `wrangler.jsonc` files. On another account you
can keep them; on another zone you change the vars marked as zone-specific.

| Worker | directory | what it serves | needs |
| --- | --- | --- | --- |
| `prodid-edge` | `apps/edge` | the index: resolver, source status, schemas, ping, media, the crawl pipeline | Postgres through Hyperdrive, R2, Queues, a Durable Object, a cron |
| `prodid-hosted` | `apps/hosted` | the hosted publisher, `<slug>.prodid.org`, and the operator endpoint | R2, a cron, the `OPERATOR_TOKEN` secret |
| `prodid-web` | `apps/web` | the static website | static assets only |

The three deploy independently. The hosted publisher shares nothing with the index but
`@prodid/core`: it asks for crawls through the public ping like any other publisher, so an index
can run without it.

## Postgres

- **PostgreSQL 18.** Development (`db/compose.yaml`) and CI use `postgres:18.6`. The migrations
  need no extension.
- **Migrations** are plain SQL in `db/migrations/NNNN_name.sql`, applied in name order, each in
  its own transaction, and recorded in `schema_migrations`. The runner takes an advisory lock, so
  two runs at once are safe. With a direct connection to the database:

  ```sh
  DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<database> bun run --filter '@prodid/db' migrate
  ```

  It prints `applied <files>` or `up to date`. Migrate before deploying an edge Worker that needs
  the new schema.
- **Hyperdrive** is how the edge Worker reaches Postgres; it never connects directly. Create a
  config and put its id in `apps/edge/wrangler.jsonc` under `hyperdrive[0].id` (binding
  `HYPERDRIVE`):

  ```sh
  bunx wrangler hyperdrive create prodid --connection-string="$DATABASE_URL"
  ```

  A database that is not on the public Internet can sit behind Cloudflare Tunnel, with Hyperdrive
  connecting over Access: `bunx wrangler hyperdrive create` with `--access-client-id` and
  `--access-client-secret` instead of `--connection-string`. `localConnectionString` in the same
  entry is the dev Postgres of `db/compose.yaml`, used by `wrangler dev`.
- **Backups** are the operator's. Test them by restoring: bootstrap a throwaway database from the
  backups, compare `count(*)` of every table and `schema_migrations` with production, delete it.

Last restore drill of prodid.org's database: not run yet.

## edge: `apps/edge/wrangler.jsonc`

| object | name | binding | what it is for |
| --- | --- | --- | --- |
| Hyperdrive | your config's id | `HYPERDRIVE` | every SQL query the Worker makes |
| Durable Object | class `RateLimiter`, SQLite storage | `LIMITS` | the crawler's rate limits: per pinged domain, registrable domain, fetched host and caller. Declared under `exports`, so the first deploy creates it; there is no `migrations` entry |
| R2 bucket | `prodid-media` | `MEDIA` | stored media under `sha256/{hex}`, served by the Worker on `media.prodid.org`. The bucket must have no public domain of its own: a blocked hash answers 410, which only the Worker can do |
| queue | `prodid-crawl` | `CRAWL` (producer) | one unit of crawl work per message: a discovery, one feed, or the finalize. Consumer: batch size 1, batch timeout 5 s, 3 retries, dead letters to `prodid-crawl-dlq` |
| queue | `prodid-media-ingest` | `MEDIA_INGEST` (producer) | one media file to fetch and store per message. Consumer: batch size 1, batch timeout 5 s, 3 retries, dead letters to `prodid-media-dlq` |
| dead letter queue | `prodid-crawl-dlq` | `CRAWL_DLQ` (producer) | crawl messages that failed their retries, and crawls held back by the crawler's own limits past the cap, which the Worker writes here directly. Consumer: batch size 10, batch timeout 30 s, 1 retry; it logs each message as a `crawl.dead-letter` line and nothing re-drives it automatically |
| dead letter queue | `prodid-media-dlq` | none | media messages that failed their retries. Nothing consumes it |
| cron | `*/10 * * * *` | | enqueue the sources that are due, finalize crawls whose lease ran out, run the lapse sweep |

| var | value in the repository | meaning |
| --- | --- | --- |
| `CRAWL_INTERVAL_MINUTES` | `360` | minutes between scheduled crawls of a source; a ping only makes the next one sooner |
| `DOH_ENDPOINT` | `https://cloudflare-dns.com/dns-query` | the DNS-over-HTTPS resolver the crawler asks for `_prodid` TXT records and for the addresses its fetch guard checks |
| `HOSTING_ZONE` | `prodid.org` | zone-specific. Names under this zone are hosted slugs, always `hosted` and `unverified`, whatever they serve |

Other settings in the file: `compatibility_flags` `nodejs_compat` (postgres.js) and
`global_fetch_strictly_public` (a fetch of the Worker's own zone goes through the front door, like
anybody else's); `limits.cpu_ms` `120000`, because one queue message may read a 256 MiB feed;
`observability.enabled`. The edge Worker has no secret.

## hosted: `apps/hosted/wrangler.jsonc`

| object | name | binding | what it is for |
| --- | --- | --- | --- |
| R2 bucket | `prodid-hosted` | `SITES` | each hosted site's settings and uploaded feeds. Shared with nothing: the index reads them over HTTPS |
| cron | `17 3 * * *` | | daily: re-read every claimed domain's `_prodid` record |
| secret | `OPERATOR_TOKEN` | | the bearer token of the operator endpoint on `OPERATOR_HOST`. Required; set it with `bunx wrangler secret put OPERATOR_TOKEN` in `apps/hosted` |

| var | value in the repository | meaning |
| --- | --- | --- |
| `DOH_ENDPOINT` | `https://cloudflare-dns.com/dns-query` | the DNS-over-HTTPS resolver used to read a claimed domain's `_prodid` record |
| `HOSTING_ZONE` | `prodid.org` | zone-specific. The zone whose labels are slugs: `<slug>.<HOSTING_ZONE>` |
| `OPERATOR_HOST` | `publish.prodid.org` | zone-specific. The host that serves the operator endpoint; its label is reserved, so no publisher is ever served on it |
| `PING_URL` | `https://prodid.org/ping` | zone-specific. Where the hosted publisher asks the index for a crawl after a change |

Other settings: `compatibility_flags` `global_fetch_strictly_public`, so the ping to the index on
the same zone goes through the front door; `observability.enabled`.

The operator CLI (`apps/batch`, `prodid-batch`) talks to that endpoint with
`PRODID_OPERATOR_TOKEN` set to the same token and `PRODID_OPERATOR_URL` set to
`https://<OPERATOR_HOST>` (default `https://publish.prodid.org`).

## web: `apps/web/wrangler.jsonc`

An assets-only Worker: no code and no bindings. It serves `./dist` with `html_handling`
`auto-trailing-slash` and `not_found_handling` `404-page`. The site's text names prodid.org; a
self-hosted index does not need it.

## Creating the objects

Once per account, in `apps/edge` (Wrangler is a dev dependency of each Worker):

```sh
bunx wrangler r2 bucket create prodid-media
bunx wrangler r2 bucket create prodid-hosted
bunx wrangler queues create prodid-crawl
bunx wrangler queues create prodid-crawl-dlq
bunx wrangler queues create prodid-media-ingest
bunx wrangler queues create prodid-media-dlq
bunx wrangler hyperdrive create prodid --connection-string="$DATABASE_URL"
```

Then set `OPERATOR_TOKEN` for the hosted Worker as above. The Durable Object needs no command.

## Deploying

From the root of a checkout that passes `bun install --frozen-lockfile` and `bun run check`:

```sh
(cd apps/edge && bunx wrangler deploy)
(cd apps/hosted && bunx wrangler deploy)
bun run --filter '@prodid/web' build
(cd apps/web && bunx wrangler deploy)
```

`bunx wrangler deploy --dry-run` bundles a Worker without uploading it. Deployment is manual; no
Cloudflare credential is stored in the repository or in CI.

Routes are attached at deploy time; the `wrangler.jsonc` files declare none. Pass them with
`--route`, one per pattern of the table below. Each hostname needs a proxied DNS record on the
zone, a wildcard one for `*.prodid.org`.

## Routes

The table of `ARCHITECTURE.md` (*Routing on prodid.org*):

| route | served by |
| --- | --- |
| `prodid.org/id/*`, `prodid.org/01/*`, `prodid.org/source/*`, `prodid.org/ping`, `prodid.org/schemas/*` | edge |
| `*.prodid.org/*` | hosted, a Worker of its own |
| `media.prodid.org/*` | edge, in front of the `prodid-media` bucket; the bucket has no public domain of its own, or the takedown list could be walked around |
| everything else on `prodid.org` | web, a static site on Workers Static Assets |

The more specific routes win, so `media.prodid.org/*` reaches edge although `*.prodid.org/*`
also matches it, and `publish.prodid.org` reaches hosted's operator endpoint.

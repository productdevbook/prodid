# 03 · Crawler

The index's crawl, ingest and media pipeline in `apps/edge`, and what keeps it from being used as
a weapon. Normative text: spec *Crawling*, *Media › Fetching*.

## Pipeline

- **[Exists]** Queue `prodid-crawl`, one unit of work per message (`max_batch_size: 1`):
  `discover{domain}`, `feed{plan, at, touched}` (one feed per message), `finalize{plan, touched}`.
  `apps/edge/src/services.ts`, `crawl/run.ts`, `consumer.ts`. CPU limit 120 s per invocation
  (`wrangler.jsonc`), sized from a measured 119 ms of CPU per MiB of feed.
- **[Exists]** Queue `prodid-media-ingest`, one file per message.
- **[Exists]** Cron `*/10 * * * *`: claim due sources (up to 500, `for update skip locked`, a 6-hour
  lease) and enqueue `discover`; close crawls open for over 6 hours as `fetch-failed`; run the lapse
  sweep. `apps/edge/src/schedule.ts`, `packages/store/src/source.ts`, `sweep.ts`.
- **[Exists]** Re-crawl interval `CRAWL_INTERVAL_MINUTES = 360`. A ping only brings the next crawl
  forward; a domain inside its window is folded into the schedule it has.
- **[Exists]** Conditional requests after discovery re-confirms the path; dropped whenever the
  source is lapsed or has nothing live.

## Fetch guard

- **[Exists]** `https`, default port, public DNS names whose every address is public, no IP
  literals, the one `www` redirect, re-checked for every fetch. `apps/edge/src/net/guard.ts`,
  `packages/core/src/address.ts`. The guard states in its own comments what the platform does and
  does not guarantee; `global_fetch_strictly_public` is routing, not an address filter.
- **[Exists]** Caps: TXT 5 s; connect/TLS/first byte 10 s; document 1 MiB within 30 s; 100 feeds;
  feed 256 MiB within 10 min; line 64 KiB; ping 1000 domains; media 20 MiB image, 50 MiB document,
  60 s, 20 entries.

## Rate limits

All counted in the `RateLimiter` Durable Object (SQLite), exact sliding windows.
`apps/edge/src/limits/`.

- **[Exists]** One discovery per domain per 10 minutes; 1000 first contacts per registrable domain
  per hour; 60 ping requests per caller per hour (IPv4 /32, IPv6 /64); per-host verified lane
  `clamp(v/100, 40, 600)` and unverified lane `clamp(v/500, 20, 200)` per minute, `v` refreshed from
  Postgres when older than 5 minutes; media 10 fetches and 200 MiB per host per minute.
- **[Exists]** A fetch held back by our own limits is deferred (acked and re-sent with a delay of at
  most 3600 s); after 12 deferrals a crawl message goes to `prodid-crawl-dlq` with a reason. A
  limiter outage defers 60 s.

## Dead letters

- **[Exists]** `prodid-crawl-dlq` is consumed and logged as one JSON line `crawl.dead-letter`;
  nothing re-drives it.
- **[Change]** `prodid-media-dlq` is configured as the media queue's dead letter queue but nothing
  consumes it, and a media message deferred past the cap is dropped with only a log line. Both are
  silent losses. The edge Worker consumes `prodid-media-dlq` and logs `media.dead-letter` with the
  same fields as the crawl one (`sha256` or URL digest, source, reason, attempts), and a media
  message deferred past the cap is sent there instead of being dropped. A dead-lettered media entry
  is retried on the next crawl of its record, as every failed media entry already is.
- **[New]** Dead letters are counted where the operator looks: the Workers observability alert of
  [07](07-project-and-operations.md#production-operations) fires on any `crawl.dead-letter`,
  `media.dead-letter` or `notify.dead-letter` line.

## As built

- Every edge test runs against a real Postgres (a throwaway database per test file through
  `@prodid/store/testing`) with in-memory fakes for the network, clock, queues, R2 and the Durable
  Object (`apps/edge/test/support/`). Without `DATABASE_URL` reaching a database they are skipped,
  which is why chapter 07 gives CI a Postgres service and makes a skip a failure there.

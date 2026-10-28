# 02 · Publishing

How a source is found, what it may publish, how it is trusted and what happens when it stops.
Normative text: spec section *Publishing* and *Security considerations*.

## Discovery

- **[Exists]** DNS TXT at `_prodid.<domain>` first, followed exclusively when a `v=prodid0`
  record exists; `https://<domain>/.well-known/prodid.json` only when none does; no fallback after
  a malformed, over-long or duplicated record. `packages/core/src/discovery.ts` (`planDiscovery`,
  `parseDiscoveryTxt`, `acceptDiscovery`), `apps/edge/src/crawl/discovery.ts`.
- **[Exists]** A step succeeds on 200 after at most the `<domain>` → `www.<domain>` redirect, a JSON
  content type, a valid `org.prodid.feed`, and the `domain` rule (required when delegated, equal
  to the domain discovered). Tests `apps/edge/test/attacks.test.ts`.
- **[Exists]** TXT grammar, concatenation, 512-byte cap, host normalization (lowercase, one trailing
  dot), ASCII only. Vectors `spec/fixtures/txt/` (29 cases), checked by both `spec/validate.ts` and
  core.

## Feeds

- **[Exists]** NDJSON on the document's own host, at most 100 per document; a document listing a
  feed elsewhere is rejected whole. `isFeedAllowed` in core.
- **[Exists]** A skipped line (over 64 KiB, unparseable, invalid) withdraws nothing for seven days
  (`feed.skipping_since`, `SKIPPING_GRACE_MS` in `packages/store/src/source.ts`), then absent keys
  are withdrawn as usual.
- **[Exists]** A feed the document stops listing is retired at once; a 304 on the document retires
  nothing. `apps/edge/src/crawl/run.ts`, `packages/store/src/source.ts`; test `round8.test.ts`.

## Trust

- **[Exists]** `verified` exactly when proof exists (`source.verified_crawl`); hosted slugs and
  datasets stay `unverified`.
- **[New]** `authoritative`: the value exists in the schema and in `recordVerification`, but nothing
  sets it. Granting it is specified in [04 · Index](04-index.md#authoritative-brands).

## Lapse

- **[Exists]** A definite negative sets `lapsed_at` at once; seven days of transport failure at a
  host the source is verified at sets it too; at a host it was never verified at, any failure is a
  definite negative. `packages/store/src/source.ts`, `apps/edge/src/crawl/run.ts`.
- **[Exists]** 30 days of continuous lapse withdraws records and active claims with one timestamp;
  the sweep runs on the ten-minute cron, up to 1000 sources a run. `packages/store/src/sweep.ts`,
  `withdraw.ts`.
- **[Exists]** A lapsed source is crawled as a probe that writes nothing; only a full success clears
  the lapse, and recovery re-asserts everything without conditional requests.

### Lapse notification

- **[New]** The spec's *Lapse* states the notice: one per lapse, to the `publisher.contact` of the
  last accepted document, what it says and never says, and that the address is never published.
  No code sends anything and the index does not keep the contact address. This closes that gap.
- **Storing the contact.** Migration `0002_source_contact.sql` adds `source.contact text null`. Each
  successful crawl writes the accepted document's `publisher.contact` (or null when absent). It is
  never shown in `/source/{name}` and never in a dump: the spec's status schema has no such field.
- **When.** The transaction that sets `lapsed_at` on a source with a contact enqueues one
  `notify` message `{ source, lapsed_at }` on a new queue `prodid-notify`. A source that is
  already lapsed is not notified again; a lapse that is cleared and starts again is a new lapse and
  a new notice.
- **What.** One plain-text mail from `notify@prodid.org`, subject
  `prodid: <name> stopped publishing`, body in this order:
  1. the source name and when the lapse started (UTC, ISO 8601);
  2. the outcome class from the public status: `definite-negative` or `transport-failure`, with
     the one-sentence meaning from the spec;
  3. the date its claims will be withdrawn (`lapsed_at` + 30 days) if nothing changes;
  4. the link `https://prodid.org/source/<name>`;
  5. what to do: fix the record, the document or the feed, then `POST /ping`;
  6. why they got it: the address is the `publisher.contact` of their own discovery document.
- **What it never contains:** the crawler's error text, any HTTP status not already in the public
  status, who pinged, or anything about another host. The mail says no more than the status page.
- **Sending.** The `notify` consumer in `apps/edge` sends through the Cloudflare Email Service
  binding `MAIL`. A send failure retries three times, then goes to `prodid-notify-dlq`, which logs
  `notify.dead-letter` like the crawl DLQ. Sending is idempotent per `(source, lapsed_at)`: the
  consumer records `source.notified_lapse_at` and skips when it equals `lapsed_at`.
- **Abuse.** The contact is whatever the document says, so a publisher can point notices at a
  stranger. Bound: one notice per lapse, lapses need a successful discovery first, and the mail
  says why it was sent. No reply address is monitored; the mail links to the GitHub issue form for
  problems.

## Identity continuity

- **[Exists]** A hosted slug whose host a domain's first verified delegation names becomes that
  domain in place (`name`, `kind`, `verified_by`, `feed_host` change; `id`, records, `opid`s stay).
  `packages/store/src/source.ts`; test `pipeline.test.ts`.
- **[Exists]** The hosted publisher writes `domain` into the served document only after it has seen
  the TXT record itself (`apps/hosted/src/verify.ts`, `sites.ts`).

## As built

- A domain that fails and has no source row stores nothing (`run.ts`): `/source/{name}` stays 404
  until the first successful discovery, as the spec requires.
- The contact travels in the crawl plan: discovery puts the accepted document's
  `publisher.contact` (or null) into it, and `finishCrawl` writes it to `source.contact` in the
  transaction that records the success (`run.ts`, `packages/store/src/source.ts`). A document that
  answered 304 carries no contact and leaves the stored one; so does a failed crawl, including one
  whose document was accepted but whose feed failed.

# 06 · Hosted publisher and operator

Publishing on behalf of those who cannot: `<slug>.prodid.org`, the operator CLI, the Merchant
import, and the self-service flow that removes the operator from the path. Normative text: spec
*Three ways to publish*, *Appendix: importing a Merchant feed*; `ARCHITECTURE.md` *Routing*.

The hosted publisher is a publisher, not part of the index: it shares nothing with edge beyond
`@prodid/core`, the index reaches it over DNS and HTTPS, and it asks for crawls through the public
ping. Every point below keeps that.

## Hosted Worker today

`apps/hosted/src/`.

- **[Exists]** Hosts: `publish.prodid.org` (`OPERATOR_HOST`) is the operator; `<slug>.prodid.org`
  is a site when the label passes the slug rules; anything else is `not-found`.
- **[Exists]** Public: `GET /.well-known/prodid.json` (canonical-hash ETag, Last-Modified, 304,
  `max-age=60`; not served while a site has no feed), `GET /feeds/{name}` (R2 stream, 304).
- **[Exists]** Operator, `Authorization: Bearer <OPERATOR_TOKEN>` compared as SHA-256 digests in
  constant time: `GET|PUT|DELETE /sites/{slug}`, `PUT|DELETE /sites/{slug}/feeds/{name}`,
  `POST /sites/{slug}/verify`.
- **[Exists]** R2 `prodid-hosted`: `sites/<slug>/site.json`, `sites/<slug>/feeds/<name>`.
- **[Exists]** Feed names `^[a-z0-9][a-z0-9-]{0,62}\.ndjson$`; 100 feeds per site; 32 MiB per
  upload; every line validated, keys unique, not empty, first 20 problems reported.
- **[Exists]** Slugs `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$`, no `--` at 3–4, ~140 reserved words,
  trailing digits stripped before the check, confusables folded, nothing that folds to contain
  `prodid`. `names.ts`.
- **[Exists]** Domain verification over DoH: a site is verified only when `planDiscovery` yields
  `dns-txt` to its own host; a failed lookup changes nothing; daily cron `17 3 * * *` re-reads every
  claimed domain and pings those that changed. `verify.ts`, `dns.ts`.
- **[Exists]** Every write pings `https://prodid.org/ping` with the slug host and the domain, in
  `waitUntil`.

## Operator CLI today

`apps/batch/src/cli.ts`, bin `prodid-batch`.

- **[Exists]** `merchant <csv|tsv> --license <spdx> [--lang] [--market]… [--out]`: local conversion
  with `importMerchantRow`; skipped rows reported by spreadsheet row number.
- **[Exists]** `site`, `feed`, `publish <slug> <csv>` (merchant → site → feed → verify), `verify`,
  `show`, `remove-feed`, `remove-site`, against `PRODID_OPERATOR_URL` (default
  `https://publish.prodid.org`) with `PRODID_OPERATOR_TOKEN`.
- **[New]** `check <file>`: validates a discovery document or an NDJSON feed exactly as the index
  would (`validateFeed`, `validateItem`, the 64 KiB line cap, the storable/identifiable rules),
  prints one line per problem with its line number, exits non-zero on any. Needs no token. It is
  the tool the website's publisher guide tells a self-publisher to run before pinging.
- **[New]** Index commands (merge, candidates, block-media, dump, load-dump, import,
  grant/revoke-authority) are specified in [04 · Index](04-index.md); they use `DATABASE_URL`, never
  the hosted token.

## Self-service hosting

**[New]** Today a publisher can do nothing without the operator: no sign-up, no ownership of a
slug, no upload, no re-verify, no export, no delete. The website marks routes 2 and 3 "Not
available yet". This section replaces the operator in that path.

### Shape

- Served by `apps/hosted` on `publish.prodid.org`, next to the operator routes, which stay.
- Server-rendered HTML with Hono's JSX, one small inline script per page at most; no SPA. Same
  colour tokens and type as the website, light and dark, 360 px wide without horizontal scroll.
- Accounts and sessions in a D1 database of the hosted Worker's own, binding `ACCOUNTS`
  (`prodid-hosted-accounts`). The index never reads it.
- Mail through the Cloudflare Email Service binding `MAIL` from `notify@prodid.org` (shared sender
  with the lapse notice, separate Worker).
- Turnstile on the sign-in form.

### Data

```
account(id text pk, email text unique, created_at, last_sign_in_at)
login_token(hash text pk, account_email text, expires_at, used_at)
session(hash text pk, account_id, created_at, expires_at)
```

`site.json` gains `owner` (account id). Sites the operator created have no owner until the
operator assigns one (`prodid-batch assign <slug> <email>`, new).

### Rules

| rule | value |
| --- | --- |
| sign-in link | single use, valid 15 minutes, only its SHA-256 stored |
| session | cookie `__Host-session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, 30 days |
| sign-in requests | 5 per email per hour, 20 per client address (/32, /64) per hour |
| sites per account | 5 |
| unused slug | a site with no feed 30 days after creation is released, after one reminder mail at day 23 |
| "Check domain now" | once per minute per site |
| uploads | as today: 32 MiB, 100 feeds, every line validated |
| CSRF | every POST carries a per-session token; `Origin` must be `https://publish.prodid.org` |

### Screens, in flow order

1. **`/` Start.** What hosting is (one paragraph), the three things needed (a Merchant file or an
   NDJSON feed, a licence choice, optionally a domain), email field, Turnstile, "Send sign-in link".
   Afterwards: "Check your inbox" with the address shown.
2. **`/signin/{token}`** consumes the link, sets the session, redirects to `/sites`. An expired or
   used link shows "This link has expired" with the form again.
3. **`/sites` Your sites.** One row per site: `<slug>.prodid.org`, domain and its state (none /
   waiting for DNS / verified), feeds count, last index crawl outcome. "New site" button (hidden at
   5). Sign out.
4. **`/sites/new` New site.** Slug field with the rules shown and checked as you type through
   `GET /slug-check?slug=` (JSON `{ok, reason}` from `checkSlug`), publisher name, contact email
   (prefilled with the account email; becomes `publisher.contact`, which receives lapse notices),
   licence select (`CC0-1.0` recommended, `CC-BY-4.0`, other SPDX as text). Create.
5. **`/sites/{slug}` Site.** Sections in order:
   1. **Status:** discovery document URL, whether it is served yet, and the index's view fetched
      from `https://prodid.org/source/<name>` over public HTTPS (trust, lapsed, last crawl
      outcome, lines skipped, feeds failed, media failed), or "not crawled yet".
   2. **Feeds:** table of name, items, size, uploaded at; "Replace" and "Delete" per feed.
   3. **Upload:** file input taking `.csv`, `.tsv` (Merchant) or `.ndjson`; for Merchant: language,
      markets (ISO 3166-1 alpha-2, multi), media licence (the seven ingestible ones or "no
      media"), feed name. The Worker converts with `importMerchantRow` — core is pure, it runs
      here — validates, stores, and shows the result: items written, rows skipped with their row
      numbers and reasons, dropped values.
   4. **Domain:** field for the domain; once saved, the exact record to add, ready to copy:
      `_prodid.<domain>  TXT  "v=prodid0; host=<slug>.prodid.org"`; "Check now" (runs
      `verifySite`, shows the TXT values found); state line. Removing the domain turns the site back
      into the unverified slug.
   5. **Settings:** publisher name, contact, licence.
   6. **Export:** "Download everything" — a zip of `site.json` and every feed, built on request.
   7. **Delete site:** type the slug to confirm. The page states what follows: the document stops
      being served, the index sees a definite negative, the source lapses, and its claims are
      withdrawn after 30 days unless it publishes again; the slug is not reusable by anyone else
      for those 30 days.
6. **`/account`:** email, sign-in history (last 10), delete account (only when it owns no site).

### Abuse

- A slug is a name, not a proof: hosted sources stay `unverified`. Squatting is bounded by 5 sites
  per account and the 30-day release of unused slugs.
- Reporting: the start page and the resolver's source page of a hosted source link "Report a
  publisher" to a GitHub issue form; the operator removes a site with `prodid-batch remove-site`.
- Uploads are validated before they are stored; the index validates again on its own.

## As built

- `publish.astro:501` says "nothing imports it for you yet" while the operator CLI does. Chapter 07
  fixes the site's wording; this chapter's self-service flow makes the import a publisher action.
- `login_token` has one column more than *Data* shows: `client`, the SHA-256 of the requester's
  /32 (IPv4) or /64 (IPv6), which the per-address limit counts
  (`apps/hosted/migrations/0001_accounts.sql`, `signin.ts`).
- Asking for a link creates no account; the `account` row is created when a link is used.
- `GET /signin/{token}` consumes the link. A mail scanner that prefetches links can therefore use
  it up before the person clicks, who then sees "This link has expired" and asks again. This is a
  known limit.
- The Turnstile secret is the Worker secret `TURNSTILE_SECRET_KEY`; the site key is the variable
  `TURNSTILE_SITE_KEY` in `wrangler.jsonc`.
- `publish.prodid.org/sites/{slug}` serves both sides: a request that carries `Authorization` goes
  to the operator endpoint (401 when the token is wrong), one without it to the session pages
  (`SELF_SERVICE` in `selfservice.tsx`, `app.ts`). `new` is a reserved slug, so `/sites/new` is
  never a site.
- Ownership lives in D1 next to the accounts: `site(slug pk, account_id, created_at, deleted_at)`
  (`0002_sites.sql`), repeated as `owner` in `site.json`. Claiming a slug checks the limit of 5 and
  that the slug is free in one statement (`claimSlug`, `owners.ts`). A deleted site keeps its row
  with `deleted_at` for 30 days: during that hold only its last owner can take the slug again.
- `site.checked_at` (`0003_site_checks.sql`) holds the last "Check now"; the check runs at most
  once a minute per site and otherwise says how many seconds remain (`takeCheck`).
- `sign_in(account_id, at)` (`0004_sign_ins.sql`) is the sign-in history; only the last 10 per
  account are kept (`SIGN_INS_KEPT`, `signin.ts`). A session row is not that history: signing out
  deletes it.
- `site.reminded_at` (`0005_site_reminders.sql`) records the unused-slug reminder and is cleared
  once the site has a feed, so a site that empties again is reminded again. The daily cron
  (`releaseUnused`, `unused.ts`) mails the reminder from day 23 and releases at day 30 and at
  least 7 days after the reminder, however late it went out. A released slug the index never
  listed (`/source/<name>` answers not crawled) is free at once; one the index knows is held for
  nobody for 30 days, as after a deletion, so its owner cannot simply take it back.
- `prodid-batch assign <slug> <email>` calls the operator route `PUT /sites/{slug}/owner` with
  `{"email": "…"}`. It creates the account if there is none, writes `owner` to `site.json`, and
  restarts the unused-slug clock. It answers 409 when another account owns the site or the account
  already owns 5 sites (`assignSite`).
- The export (`GET /sites/{slug}/export`) is a zip of stored, uncompressed entries streamed from
  R2: `site.json` and `feeds/<name>` for every feed, byte-identical to what is stored, named
  `<slug>.prodid.org.zip` (`zip.ts`). It has no zip64, so it stays under 4 GiB, which 100 feeds of
  32 MiB do.
- A feed's item count is stored with it as R2 custom metadata `items`, which the Feeds table
  reads instead of opening the feed (`storeFeed`, `sites.ts`).
- `apps/hosted/src/merchant.ts` mirrors `convertMerchant` of `apps/batch/src/merchant.ts`: the
  same `readDelimited` and `importMerchantRow` loop, so an upload and `prodid-batch merchant` give
  the same feed. A change to one is made to both.

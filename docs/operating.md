# Operating prodid.org

What the operator does by hand: the hosting that self-service does not cover, taking a file down,
reading the dead letters, and answering a publisher whose source lapsed. Every command here is
`prodid-batch` (`apps/batch/src/cli.ts`; from the repository root, `bun apps/batch/src/cli.ts`) or
plain `curl` against public URLs. The outputs shown were produced by running each command against
a local stack (the hosted Worker under `wrangler dev`, the dev Postgres) or, for the public URLs,
against production; values that differ per run are written `<…>`.

Design: [04 · Index](design/04-index.md) (takedown) and
[06 · Hosted publisher and operator](design/06-hosted-and-operator.md) (hosting, the CLI).

## The CLI

`prodid-batch --help` prints:

```
prodid-batch <command>

  merchant <file.csv|tsv> --license SPDX [--lang TAG] [--market CC]... [--out FILE]
      Convert a Google Merchant product file to an org.prodid.item feed (stdout by default).

  check <file>...
      Validate a discovery document (.json) or an NDJSON feed as the index would. One line per
      problem, with the feed line it is on; exits non-zero on any. Needs no token.

  site <slug> --publisher NAME --license SPDX [--contact EMAIL] [--domain DOMAIN]
      Create or update a hosted site at <slug>.prodid.org.

  feed <slug> <file.ndjson> [--name NAME.ndjson]
      Upload a feed to a site. The name defaults to the file name.

  publish <slug> <file.csv|tsv> --publisher NAME --license SPDX [--contact EMAIL] [--domain DOMAIN]
          [--lang TAG] [--market CC]... [--name NAME.ndjson]
      merchant, site and feed in one step, then verify when a domain is given.

  assign <slug> <email>
      Give a site to the self-service account of <email>, made if there is none yet; it then
      appears in that account's sites at https://publish.prodid.org/sites.

  verify <slug>         Re-read the claimed domain's _prodid record.
  show <slug>           Print a site's settings and its served document.
  remove-feed <slug> <name>
  remove-site <slug>

  block-media <sha256> --reason TEXT
      Take a file down: block the hash in the index and withdraw every claim naming it, delete
      sha256/<hex> from the media bucket, and purge https://media.prodid.org/sha256/<hex> from the
      cache. Prints each step's result; run it again to finish a step that failed. Needs
      DATABASE_URL, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MEDIA_BUCKET,
      CLOUDFLARE_API_TOKEN (Cache Purge) and CLOUDFLARE_ZONE_ID; never the operator token.

  merge <from-opid> <into-opid> --reason TEXT
      Merge an entity into another of the same kind; <from-opid> then answers with a 308 to the
      survivor, which lists it in merged_from. Prints the merge id and the final survivor. The
      reason is at most 500 characters; PRODID_OPERATOR (e.g. a GitHub login) is recorded as the
      decider. Needs DATABASE_URL and PRODID_OPERATOR; never the operator token.

  unmerge <from-opid>
      Revert the active merge of <from-opid>, so it resolves on its own again with everything it
      held. Prints what now resolves where. Needs DATABASE_URL.

  candidates [--limit 100]
      List items from different sources that share a normalized brand and an identical name and
      have no conflicting GTIN, one tab-separated line per pair: both opids, each with its source,
      then the brand and name as JSON strings. It only reads; merging stays a human decision.
      Needs DATABASE_URL.

block-media, merge, unmerge and candidates print the database host first; all but candidates write
to it directly.

site, feed, publish, assign, verify, show, remove-feed and remove-site call the operator endpoint,
PRODID_OPERATOR_URL (default https://publish.prodid.org), authenticated with PRODID_OPERATOR_TOKEN.
```

Two sets of credentials, never mixed:

- **Hosting**: `PRODID_OPERATOR_TOKEN` (and `PRODID_OPERATOR_URL` only to point at another
  hosted Worker). Without it: `PRODID_OPERATOR_TOKEN is not set`, exit 1. With a wrong one:
  `operator endpoint answered 401: no body`, exit 1.
- **Index**: `DATABASE_URL` on a direct connection to Postgres, for `block-media`, `merge`,
  `unmerge` and `candidates`; the R2 S3 API keys and a Cloudflare API token with Cache Purge, for
  `block-media` only.

Secrets live outside the repository. Export them in the shell from the operator's own store; never
paste them into an issue, a log or a command line that is saved.

Every error from the operator endpoint is printed as `operator endpoint answered <status>: <body>`
and exits 1.

## Hosting

Publishers host their catalogue themselves at [publish.prodid.org](https://publish.prodid.org/)
([06 · Self-service hosting](design/06-hosted-and-operator.md#self-service-hosting)): they sign in
with their email, claim a slug, upload a Merchant file or an NDJSON feed, add a domain and check
it, export the site and delete it. Every upload pings the index. The operator is not in that path,
and there is no issue form for it: a request that still arrives as an issue is answered with the
link and closed.

The commands below are for the exceptions: a site the operator sets up on a publisher's behalf, a
site made with the CLI that is to be handed to its publisher's account, and a site that has to be
changed or removed without its owner. A site the CLI creates has no owner, so nobody can sign in to
manage it until `assign` ([step 5](#5-giving-the-site-to-its-publisher-assign)) gives it one.

To set one up, have from the publisher: the slug, the publisher name, a contact, the licence, the
file (a Merchant `.csv` or `.tsv` with its language and markets, or an NDJSON feed), and optionally
a domain. The contact is public: it is written into the site's discovery document.

### 1. A Merchant file: `publish`

Download the attached file, then:

```sh
prodid-batch publish acme feed.csv --publisher "Acme Tools Ltd" --contact products@example.com \
  --license CC-BY-4.0 --lang en --market TR
```

```
row 6 skipped: /identifiers/0/value must be a GTIN (check-digit)
row 3 dropped: product_detail: Storage:Machine wash:cold, product_detail: Catalogue:Product type:ignored
4 items, 1 rows skipped
{
  "feed": "feed.ndjson",
  "items": 4,
  "url": "https://acme.prodid.org/feeds/feed.ndjson"
}
```

The first lines go to stderr: each skipped row with its spreadsheet row number and why, each row
whose values were dropped, then the count. The JSON is the stored feed. The feed name is the file's
stem plus `.ndjson` unless `--name` gives one; publishing again under the same name replaces that
feed. A file in which no row becomes an item stops with `no row became an item` before anything is
uploaded. Pass the skipped and dropped lines on to the publisher.

The same conversion without uploading, to look first: `prodid-batch merchant feed.csv --license
CC-BY-4.0 --lang en --market TR --out items.ndjson` prints the same stderr lines and writes the
feed.

### 1′. An NDJSON feed: `check`, `site`, `feed`

```sh
prodid-batch check items.ndjson
```

```
items.ndjson: ok, 4 records
```

A feed with problems prints one line per problem, `<file>:<line>: <problem>`, and exits 1:

```
broken.ndjson:1: / must have required property '$type'
broken.ndjson:1: / must have required property 'key'
broken.ndjson:1: / must have required property 'brand'
broken.ndjson:1: / must have required property 'name'
broken.ndjson:1: / must have required property 'identifiers'
broken.ndjson:1: / must NOT have additional properties
```

Send those lines to the publisher and stop there. A clean feed is published in two steps; the
site must exist before its feed (otherwise `operator endpoint answered 404: {"error":"no such
site"}`):

```sh
prodid-batch site acme --publisher "Acme Tools Ltd" --contact products@example.com --license CC-BY-4.0
prodid-batch feed acme items.ndjson --name catalogue.ndjson
```

`site` prints the same JSON as `show` (below). `feed` prints:

```
{
  "feed": "catalogue.ndjson",
  "items": 4,
  "url": "https://acme.prodid.org/feeds/catalogue.ndjson"
}
```

The hosted Worker validates every line again; a refused upload prints
`operator endpoint answered 400: {"error":"feed refused","problems":[{"line":1,"error":"…"}]}`.

A slug the rules refuse answers `operator endpoint answered 400: {"error":"slug refused:
<reason>"}`, for example `slug refused: reserved`. Ask the publisher for another one.

### 2. A domain: the TXT record and `verify`

With a domain, give `--domain` to `publish` or `site`; `publish` then runs `verify` at the end.
Tell the publisher the record to add, exactly:

```
_prodid.<domain>  TXT  "v=prodid0; host=<slug>.prodid.org"
```

Until they have, the domain is stored but not served: the document names the domain only once
the hosted Worker has seen the record itself. After they say it is in place:

```sh
prodid-batch verify acme
```

```
{
  "outcome": {
    "state": "not-delegated",
    "domain": "example.com",
    "reason": "no-record"
  },
  "site": { … },
  "document": { … }
}
```

`outcome.state` is one of `verified`, `not-delegated` (with `reason`: `no-record`,
`bad-domain`, `record names <host>`, or the discovery rule that failed), `lookup-failed` (the
DNS lookup itself failed; nothing changed, try again later) or `no-domain`. The daily re-check
at 03:17 UTC finds a record added later without you.

### 3. `show`

```sh
prodid-batch show acme
```

```
{
  "site": {
    "slug": "acme",
    "publisher": {
      "name": "Acme Tools Ltd",
      "contact": "products@example.com"
    },
    "license": "CC-BY-4.0",
    "feeds": [
      "feed.ndjson"
    ],
    "updatedAt": "<ISO 8601>"
  },
  "host": "acme.prodid.org",
  "document": {
    "$type": "org.prodid.feed",
    "version": 0,
    "publisher": {
      "name": "Acme Tools Ltd",
      "contact": "products@example.com"
    },
    "license": "CC-BY-4.0",
    "feeds": [
      "https://acme.prodid.org/feeds/feed.ndjson"
    ]
  }
}
```

`site` is the stored settings (`domain`, `verified` and `verifiedAt` appear when set); `document`
is what `https://<slug>.prodid.org/.well-known/prodid.json` serves.

### 4. Confirm the index has it

Every write pings the index. A few minutes later the source's status is public:

```sh
curl -s https://prodid.org/source/acme.prodid.org
```

```
{"$type":"org.prodid.source","name":"<slug>.prodid.org","kind":"hosted","trust":"unverified","lapsed":false,"license":"CC-BY-4.0",
 "last_crawl":{"at":"<ISO 8601>","outcome":"success","via":"well-known","document_url":"https://<slug>.prodid.org/.well-known/prodid.json",
 "http_status":200,"records_seen":4,"records_changed":4,"lines_skipped":0,"feeds_failed":0,"media_failed":<n>}}
```

Until the first successful crawl it answers 404 `unknown-source`. Tell the publisher the site host,
the status URL, the skipped and dropped rows, and `media_failed` if it is not 0 (images on hosts
that do not answer, or in a type or licence the index does not ingest).

### 5. Giving the site to its publisher: `assign`

```sh
prodid-batch assign acme products@example.com
```

It prints the same JSON as `show`, with `site.owner` set to the id of that address's account,
which is made if there is none yet. The publisher then signs in at
[publish.prodid.org](https://publish.prodid.org/) with that address, finds the site in their
sites, and from then on uploads, checks the domain, exports and deletes it themselves. Assigning
restarts the unused-slug clock (a site with no feed is released after 30 days); assigning the same
address again changes nothing. Refusals, nothing written:

- `operator endpoint answered 409: {"error":"site has another owner"}`: a site is never moved
  from one account to another this way.
- `operator endpoint answered 409: {"error":"<email> already owns 5 sites"}`.
- `operator endpoint answered 400: {"error":"email is not an email address"}`.

### Removing

```sh
prodid-batch remove-feed acme feed.ndjson
prodid-batch remove-site acme
```

Both print nothing and exit 0. Afterwards `show` answers `operator endpoint answered 404:
{"error":"no such site"}`. Removing the site stops the document being served; the index sees a
definite negative, the source lapses at once, and its claims are withdrawn 30 days later unless it
publishes again. Removing the last feed while keeping the site stops the document being served
too.

## Taking a file down

From a "Report a publisher" issue that names media. Find the file's digest: the claim's
`media_url` in the entity JSON is `https://media.prodid.org/sha256/<hex>`.

```sh
curl -s -H 'Accept: application/json' https://prodid.org/01/<gtin>
```

The claim looks like
`{"property":"media","value":{"url":"…","kind":"image","sha256":"<hex>","license":"…","media_url":"https://media.prodid.org/sha256/<hex>"},…}`.
Then, with the index credentials exported:

```sh
prodid-batch block-media <hex> --reason "<why, for the operator's record>"
```

```
database: <host>:<port>
block: ok, <n> claims withdrawn
delete: ok, prodid-media/sha256/<hex>
purge: ok, https://media.prodid.org/sha256/<hex>
```

- The first line is the database it writes to. The run does not pause there, so check that
  `DATABASE_URL` is production before you start.
- `block` puts the hash on the takedown list and withdraws every active claim naming it, in one
  transaction. A record that publishes the same file again does not bring it back. The reason is
  never shown to readers; a second run keeps the first block time and reason and reports 0 claims.
- `delete` removes the stored file; `purge` removes it from the Cloudflare cache.
- A failed block stops the run. The delete and the purge are each tried whatever the other did. Any
  failure exits 1, and running the same command again finishes it, for example:

  ```
  database: <host>:<port>
  block: ok, 0 claims withdrawn
  delete: ok, prodid-media/sha256/<hex>
  purge: failed, Cloudflare answered 404: 7003 Could not route to /client/v4/zones/<zone>/purge_cache, perhaps your object identifier is invalid?
  ```

Refusals, all exit 1 before anything is written: `DATABASE_URL is not set`; `<names> are not set`
for any other missing variable; `<value> is not a sha256 hex digest`; `missing --reason`.

Check the result from outside:

```sh
curl -sI https://media.prodid.org/sha256/<hex>
```

A served file answers `HTTP/2 200` with `cache-control: public, max-age=31536000, immutable`; a
blocked one answers `410` with `application/problem+json` (`…/problem/blocked-media`). Browsers
that already cached the file keep it; nothing reaches them. Answer the issue with the `curl -I`
status line. When the whole hosted site is the problem, remove it as above.

## Reading dead letters

Nothing is lost silently and nothing is re-driven automatically. The edge Worker (`prodid-edge`)
writes one JSON line per dead letter to its logs (Workers observability is on). Follow them live
from `apps/edge` with:

```sh
bunx wrangler tail prodid-edge --format json --search dead-letter
```

or search the Worker's logs in the Cloudflare dashboard for `dead-letter`. The two shapes:

```
{"event":"crawl.dead-letter","reason":"held back by the crawler's own limits 13 times","domain":"example.com","step":"discover","crawl":null,"deferrals":12}
{"event":"crawl.dead-letter","reason":"failed on every retry of prodid-crawl","domain":"example.com","step":"discover","crawl":null,"deferrals":0}
{"event":"media.dead-letter","url_sha256":"<hex>","source":"example.com","reason":"held back by the crawler's own limits 13 times","attempts":13}
{"event":"media.dead-letter","url_sha256":"<hex>","source":"example.com","reason":"failed on every retry of prodid-media-ingest","attempts":0}
```

- `held back by the crawler's own limits` is the crawler's own rate limit, not the publisher:
  the host is busy. `step` is `discover`, `feed` or `finalize`; `crawl` is the crawl id for the
  last two.
- `failed on every retry of …` is a message that failed on each of its three queue retries.
- A media line names the URL only by its SHA-256 (`url_sha256`); the publisher's URL is never
  logged. `attempts` counts deferrals.

To re-drive a crawl, ping the domain:

```sh
curl -s -X POST https://prodid.org/ping -H 'content-type: application/json' --data '{"domain":"canary.prodid.org"}'
```

```
{"status":"accepted"}
```

The answer is `202` and says nothing else; the result shows in the source's status.

A dead-lettered media entry needs nothing: it is fetched again on the next crawl of its record.

## A lapsed publisher

The status says it: `"lapsed":true` with `lapsed_at`, and `last_crawl.outcome` is
`definite-negative` or `transport-failure`.

```sh
curl -s https://prodid.org/source/<name>
```

The index does not send the lapse notice yet (chapter 02, *Lapse notification*). Until it does,
write to the publisher yourself, at the `publisher.contact` of their document, and say no more
than the status says, in this order:

1. the source name and when the lapse started (`lapsed_at`, UTC);
2. the outcome: `definite-negative` means discovery ended with no acceptable document (no record,
   a malformed record, or a document refused); `transport-failure` means the document or a feed
   could not be read for seven days in a row;
3. the day its records and claims will be withdrawn if nothing changes: `lapsed_at` + 30 days;
4. the status page, `https://prodid.org/source/<name>`;
5. what to do: put the record, the document or the feed back, then `POST /ping`; for a hosted
   site, upload the feed again at `https://publish.prodid.org/sites/<slug>`, which pings for
   them;
6. why they are hearing from us: the address is the `publisher.contact` of their own document.

Never add the crawler's error text, an HTTP status the status page does not show, who pinged, or
anything about another host. Recovery needs nothing to change: once a crawl succeeds in full, the
lapse clears and everything the source publishes is asserted again.

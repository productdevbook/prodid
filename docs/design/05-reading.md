# 05 · Reading

What readers get from the index: the resolver, the documents, the pages a QR scan lands on, the
errors and the media. Normative text: spec *Reading*, *Media › Serving*.

## Routes

`apps/edge/src/app.ts`; negotiation and ETags `apps/edge/src/http.ts`.

| route | status |
| --- | --- |
| `GET /id/{opid}` | **[Exists]** entity; merged opid → `308` to `/id/{survivor}` (keeps `?history=1`); `?history=1` adds withdrawn claims |
| `GET /01/{gtin}` and `/01/{gtin}/*` | **[Exists]** the item itself with `Content-Location: /id/{opid}`; extra Digital Link segments ignored; `invalid-gtin`, `restricted-gtin`, `unknown-gtin` |
| `GET /source/{name}` | **[Exists]** status, exact name then lowercase; 404 until first successful discovery |
| `GET /schemas/v0/{file}` | **[Exists]** the four schemas, `application/schema+json`, `max-age=3600` |
| `GET /schemas/v1/{file}` | **[New]** the five v1 schemas, served like v0's and beside them for good (chapter 07, *How v0 and v1 coexist*) |
| `POST /ping` | **[Exists]** caller budget checked before the body is read; `202 {"status":"accepted"}` |
| `GET /sha256/{hex}` | **[Exists]** media; see below |

- **[Exists]** JSON unless `text/html` has a strictly higher q-value; ETag over variant + canonical
  JSON, `Vary: Accept`, 304 on `If-None-Match`. Resolver answers `public, max-age=60,
  stale-while-revalidate=300`; problems that depend on state are `no-store`.
- **[Change]** Media is served on any host the Worker is routed for, so `prodid.org/sha256/<hex>`
  answers the file too. `ARCHITECTURE.md` routes media to `media.prodid.org` only. `/sha256/*`
  answers only when the request host is `MEDIA_HOST` (new var, `media.prodid.org`) and the
  resolver routes do not answer on `MEDIA_HOST`; anything else is `not-found`. One origin for
  active-content-free bytes, one for documents.
- **[New]** JSON answers of `/id`, `/01`, `/source` and `/schemas` carry
  `Access-Control-Allow-Origin: *`, so a web page can read the open record directly: problems,
  the `304`s and the merged-opid `308` included, HTML answers not. The spec's *The resolver* says
  so. Media already does.
- **[New]** `/schemas/v0/org.prodid.dump.json` once chapter 04's dump schema exists.

## HTML pages

A QR code on a product lands a phone on `/01/{gtin}`. Today `apps/edge/src/render.ts` answers a
semantic, unstyled page and says itself that a designed rendering of the same `EntityView`
(`apps/edge/src/view.ts`) replaces it without anything outside that file changing.

- **[Exists]** Entity page: heading, definitions (opid, kind, family, variant links), Names, Brands,
  identifiers table, property tables, media list, Children, Merged from. Source page: name, kind,
  trust, lapsed, verified by, licence, last crawl rows. Problem pages.
- **[Change]** Designed pages, still one self-contained HTML string per answer from `render.ts`:
  inline CSS (no external requests), the website's colour tokens and type scale copied from
  `apps/web/src/styles/global.css`, light and dark by `prefers-color-scheme`, readable at 360 px
  with no horizontal scroll, the prodid wordmark linking to `https://prodid.org/`.

### Languages

- **[New]** (owner, 2026-10-29, #109) The interface text of every HTML answer (entity, source and
  problem pages) comes in en, zh-Hans, es, ar, fr, ru, pt-BR, de, ja and tr: the six UN languages,
  the three largest retail markets beyond them, and the first market. The language is `?lang=` when
  it names one of them, else the best match of `Accept-Language`, else English; the answer sends
  `Content-Language`, `<html lang>`, `dir="rtl"` for Arabic, and `Vary: Accept-Language` when it
  negotiated. Claim values are never translated: where claims of one property differ by `lang`, the
  one in the page's language comes first. The footer lists every language as a `?lang=` link. JSON
  answers do not change.

### Entity page, sections in order

1. **Header:** the `name` claims' values (several when sources disagree, each with its source
   chip), the kind, and the opid in monospace with a copy button that works without JavaScript
   failing the page.
2. **Source chips** everywhere a value appears: source name, trust (`verified` /
   `unverified` / `authoritative`), "lapsed" in the warning colour when it is, and `seen_at` as a
   date with the full timestamp in `title`.
3. **Images:** the `media` claims of kind `image` as a horizontal strip of `media_url` thumbnails
   (`loading="lazy"`, width and height set), each with its licence; documents as a list of links
   marked "PDF".
4. **Brand**, **Identifiers** (scheme, value, scope where present), **Category**, **Markets**.
5. **Variant** axes, then **Properties**, as two-column tables; a property with claims from two
   sources shows both rows.
6. **Family and variants:** links up (family, variant) and down (children), by kind.
7. **Merged from**, when present.
8. **Footer:** "Every value is a claim by its source. Choosing between them is yours." Links: JSON
   (`?` with `Accept: application/json` explained), history (`?history=1`), the spec.

With `?history=1`, withdrawn claims show in place, struck through, with `withdrawn_at`.

### Source page, sections in order

1. **Header:** source name, kind, trust badge, and a lapse banner when lapsed: since when, and the
   withdrawal date (`lapsed_at` + 30 days).
2. **Verification:** `verified_by`, `verified_at`, licence.
3. **Last crawl:** at, outcome (`success` / `definite-negative` / `transport-failure` with the
   spec's one-line meaning), via, document URL and HTTP status when present, records seen and
   changed, lines skipped, feeds failed, media failed.
4. **Footer:** what the status does and does not say (the spec's two rules), link to the spec
   section.

### Problem pages

Title, the status code, the problem's one-line `title`, and for `unknown-gtin` one line: "No
publisher has published this GTIN yet. Manufacturers publish at prodid.org/publish."

## Media serving

- **[Exists]** Sniffed `Content-Type`, `nosniff`, `default-src 'none'; sandbox`, `attachment` for
  documents, `public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`; `410
  blocked-media` before R2 is read; 304 on the R2 etag.

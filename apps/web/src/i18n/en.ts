import { CONTACT, SPEC_STATUS } from '@/lib/spec'

export const en = {
	common: {
		skip: 'Skip to content',
		home: 'prodid, home',
		primary: 'Primary',
		nav: {
			spec: 'Specification',
			specShort: 'Spec',
			publish: 'Publish',
			publishShort: 'Publish',
			data: 'Data',
			dataShort: 'Data',
		},
		github: 'Source on GitHub',
		toDark: 'Switch to dark theme',
		toLight: 'Switch to light theme',
		language: 'Language',
		status: SPEC_STATUS,
		normative: 'The specification is published in English only, and the English text is the normative one.',
		imageAlt:
			'prodid: publishers state product facts on their own domains, one open index joins every code to a permanent identifier, and anyone can download the whole index.',
		footer: {
			tagline: 'An open identity and data layer for every physical product.',
			label: 'Footer',
			site: 'Site',
			specification: 'Specification',
			publish: 'Publish your products',
			github: 'Source on GitHub',
			contact: 'Contact',
			report: 'Report a problem',
			security: 'Security',
			licence:
				'The specification and the schemas are CC0, and so are the `opid`s and the identifier mappings prodid.org publishes. Every other claim carries the licence of the source that made it. The reference implementation is Apache-2.0.',
		},
	},

	home: {
		title: 'prodid — open identity for every physical product',
		description:
			'prodid gives every physical product a permanent open identifier. GTIN, MPN and every other code resolve to it, and every fact is a claim attributed to its source.',
		badge: 'Spec v1 · live',
		headline: 'A barcode is not a product.',
		headlineAccent: 'prodid is.',
		lead: 'A permanent, open identifier for every physical product. Every barcode and part number resolves to it, and every fact about it names the source that said it.',
		ctaPublish: 'Publish your products',
		ctaSpec: 'Read the specification',
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `navy · M · sold in ${markets}`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: 'What scanning the code on the label returns. The record is the specification’s own example.',
		sceneLabel:
			'Publishers on their own domains, hosted publishers and open datasets send claims to one open index, which resolves the code on a product and publishes the whole index as dumps.',
		sceneCaption:
			'Publishers state facts on their own domains, hosted or from open datasets. The index joins every code on the label to one permanent opid, and the whole index is open to download.',
		problem: {
			eyebrow: 'The problem',
			heading: 'Four codes, one jacket, and nothing joining them.',
			body: 'A product gets a new barcode for every market, pack size and packaging change, and its data sits in a different system for each one. When two of them disagree, one is quietly overwritten.',
			answer: 'prodid gives the product itself an identifier that does not change when the barcode does.',
			figure: 'Several codes resolving to one variant',
			anotherGtin: 'another GTIN',
			codes: ['retail unit for DE and TR', 'the same jacket in a two-pack', 'next year’s packaging', 'manufacturer part number'],
			variant: 'One variant',
			variantNote: 'Never reused, never deleted. Every code that ever pointed here keeps working.',
		},
		model: {
			eyebrow: 'The model',
			heading: 'Family, variant, item. Codes point at them; they are not them.',
			lead: 'Each level has its own `opid`: 16 characters that encode nothing, so nothing about the product can make them wrong.',
			levels: [
				{ title: 'Acme Trail Jacket', note: 'The product as people talk about it.' },
				{ title: 'navy · size M', note: 'One combination of colour, size and the like.' },
				{ title: 'Retail unit for DE and TR', note: 'The thing that carries a barcode.' },
			],
			after:
				'New packaging adds a new item with a new barcode, under the same variant and the same family. Nothing that pointed at the old one breaks.',
		},
		how: {
			eyebrow: 'How it works',
			heading: 'Publish on your domain. prodid indexes it. Anyone resolves it.',
			publish: {
				step: '01 · Publish',
				title: 'Three things on your domain',
				body: 'A discovery document, a feed with one product per line, and a DNS record that proves the domain is yours.',
				link: 'How to publish →',
			},
			index: {
				step: '02 · Index',
				title: 'Checked, matched, attributed',
				checks: [
					'every line validated against the schema',
					'matched to an existing opid, or a new one',
					'each field stored as a claim by your domain',
				],
				body: 'Retailers, registries and open datasets are sources the same way: beside the maker, never on top of it.',
				link: 'How claims work →',
			},
			resolve: {
				step: '03 · Resolve',
				title: 'One URL, printed on the product',
				browser: 'Browser → a page',
				api: 'API → the JSON record',
				body: 'The path is GS1 Digital Link syntax, so it can be the QR code on the label itself.',
				link: 'How resolving works →',
			},
		},
		claims: {
			eyebrow: 'Claims',
			heading: 'Every fact names its source. Disagreement stays visible.',
			lead: 'Nothing is merged into one “truth”. When a source stops publishing, its claims are kept and marked lapsed, not deleted.',
			caption: 'The claims in the specification’s example item',
			columns: ['Property', 'Value', 'Source', 'Trust', 'Seen'],
			lapsed: ' · lapsed',
			trust: [
				'Controls the domain and is confirmed as the brand owner.',
				'Proved control of a domain through DNS or its own website.',
				'A hosted name without a domain, a dataset, or a contribution.',
			],
			details: 'See the request and the full JSON record',
			request: 'Request and response headers',
		},
		who: {
			eyebrow: 'Who it is for',
			heading: 'The people who make the data, and the people who need it.',
			audiences: [
				{
					title: 'Manufacturers',
					body: 'State your product data once, on your own domain. No reseller listing or marketplace owns the description of what you make.',
				},
				{
					title: 'E-commerce, ERP and PIM vendors',
					body: 'One discovery document and one feed per merchant domain, generated from data you already hold.',
				},
				{
					title: 'Developers',
					body: 'Resolve any code to an identifier that survives repackaging. Every fact says who said it, when, and whether that source still stands behind it.',
				},
			],
			passport:
				'**On the EU Digital Product Passport.** ESPR asks for a passport reachable from a data carrier on the product, and GS1 Digital Link is one of the carrier syntaxes being standardised for it. prodid is not a passport service and publishing here is not compliance with anything; it is the same groundwork: one machine-readable record per product, at a stable address you control.',
		},
		status: {
			eyebrow: 'Status',
			heading: 'Where this actually stands.',
			stable: {
				label: 'Stable',
				title: 'Specification v1.',
				body: `It changes only by addition; anything else would be v2. A v0 discovery document is accepted until 2027-01-26 00:00 UTC. [Read it](/spec) and [say where it is wrong](${CONTACT.issues}).`,
			},
			sources: {
				label: 'Canary and one dataset',
				title: 'No publisher’s catalogue is indexed yet.',
				body: "The index holds two sources: the project's own canary, [canary.prodid.org](https://prodid.org/source/canary.prodid.org), which proves publishing, crawling and resolving end to end, and [dataset:wikidata](https://prodid.org/source/dataset:wikidata), a bounded test import of 5 Wikidata items, unverified and under CC0-1.0.",
			},
			design: {
				label: 'By design',
				title: 'The index is replaceable.',
				body: 'The spec, the schemas, the opids and the code mappings are [CC0](/spec#licensing). Each claim keeps its source’s licence. The facts live on the domains that publish them, so anyone can crawl them again and printed codes keep their meaning.',
			},
		},
	},

	publish: {
		title: 'Publish your products — prodid',
		description:
			'How a manufacturer or a software vendor publishes product data to prodid: the discovery document, the NDJSON feed, the one DNS TXT record that holds the identity, and the ping.',
		eyebrow: 'Publisher guide',
		heading: 'Publish your products',
		lead: 'Publishing to prodid means putting two files on the web and one record in DNS. On your own domain there is nothing to sign up for and no key to keep: the domain is the credential, and you change or withdraw what you publish by changing the files.',
		discovery: {
			heading: 'How the index finds you',
			lead: 'Worth knowing before anything else, because it decides which of the three routes below is yours. Discovery runs from scratch on every crawl, DNS first, and nothing about the path to your data is remembered between crawls.',
			first: 'First',
			firstTitle: 'A DNS TXT record at `_prodid.acme.example`',
			firstBody:
				'If a `v=prodid0` record is there it is followed exclusively, even when it names your own domain. The record names a *host*; the document is always `https://<host>/.well-known/prodid.json`.',
			second: 'Only if there is no such record',
			secondBody: 'The document on the domain itself. Whoever serves the domain over HTTPS speaks for it.',
			why: 'DNS comes first because it is the stronger proof: whoever can put a file on a host is not always who owns the domain, and the owner has to be able to override that. Which is also why you should write the record even when you serve the file yourself — [route 1, step 3](#own-domain) explains what it buys you.',
			one: '**Exactly one record, and nothing behind it.** More than one `v=prodid0` record at that name is an error, not a choice between them, and a single malformed or over-long one is an error too. There is no fallback: once a record exists, a record that does not work ends discovery rather than sending the crawler to look at your domain instead. If you are moving hosts, replace the record — never add a second. The grammar, with test vectors, is in the [specification](/spec#the-_prodid-txt-record).',
			answer:
				'**What counts as an answer.** HTTP 200 after at most one redirect, a JSON content type, a body that validates against the feed schema, and a `domain` that names the domain being discovered. A site that answers unknown paths with an HTML page and a 200 is not answering, and neither is a document served as `text/html`.',
		},
		routes: {
			heading: 'Choose how you publish',
			lead: 'Identity and hosting are separate. Your identity is a domain you control; where the documents are actually served is a detail you can change later without changing your identity or any identifier prodid has assigned to your products. Three routes, all producing exactly the same records.',
			route: (n: string) => `Route ${n}`,
			detail: (n: string) => `Route ${n} in detail →`,
			start: 'Start at publish.prodid.org →',
			identity: 'Identity',
			trust: 'Trust',
			items: [
				{
					when: 'You can serve files on your own domain.',
					who: 'A brand with an IT team, or a platform — e-commerce, ERP, PIM — publishing for every merchant it hosts.',
					how: 'Serve the discovery document on the domain, and publish a TXT record naming the domain itself.',
					identity: 'the domain',
				},
				{
					when: 'You own a domain but cannot serve files from it.',
					who: 'A manufacturer whose website is on a platform it does not control.',
					how: 'Publish at a hosted slug and point one TXT record on your domain at that host.',
					identity: 'the domain, proven by DNS',
				},
				{
					when: 'You have no domain at all.',
					who: 'A small producer or a cooperative.',
					how: 'Publish at a hosted slug. Add a domain later without losing anything.',
					identity: 'the slug host',
				},
			],
			hosted:
				'Routes 2 and 3 use the hosted publishing service at `<slug>.prodid.org`. Sign in at [publish.prodid.org](https://publish.prodid.org/) with a link sent to your email, create a site, upload your file, and connect a domain if you have one. You can export everything or delete the site there at any time.',
		},
		table: {
			field: 'Field',
			required: 'Required',
			what: 'What it is',
			yes: 'yes',
			no: 'no',
			delegating: 'when delegating',
		},
		own: {
			eyebrow: 'Route 1',
			heading: 'Publish on your own domain',
			lead: 'Two files and one DNS record. A platform publishing on behalf of merchants does the same thing on each merchant domain, so every merchant keeps its own identity and its own trust level.',
			step1: 'Step 1 — Serve the discovery document',
			step1Lead: (url: string) => `One file, at a fixed path, listing where your product feeds are: \`${url}\``,
			feedCaption: 'The example from spec/fixtures/v1/examples/prodid.json, rendered from the file itself.',
			feedTable: 'Discovery document fields',
			feedFields: [
				'Always org.prodid.feed.',
				'1. A document with 0 is accepted by crawls that start before 2027-01-26 00:00 UTC and refused after, as a definite negative.',
				'The name a person should see next to your claims.',
				'An email address someone actually reads. It is where the index writes when your source lapses, which is the only warning you get.',
				'SPDX identifier covering the facts in your feeds, such as CC0-1.0.',
				'Up to 100 https URLs, every one on the same host as this document.',
				'The domain this document speaks for. Required whenever the document is reached through a TXT record naming some other host, and then it must equal that domain. Optional when the domain serves the document itself, and if present it must still match.',
			],
			serve:
				'Serve it over HTTPS on the default port, with a valid certificate, as `application/json` — or any `application/…+json`. Do not redirect it to another host: the one redirect the crawler follows is `acme.example` to `www.acme.example`.',
			step2: 'Step 2 — Serve the feed',
			step2Lead:
				'A feed is NDJSON: one complete JSON object per line, UTF-8, newline separated. No array around it, no commas between lines. That way a feed of two million products streams line by line, and one bad line costs you that line rather than the rest.',
			itemsCaption:
				'Three variants of one product, from spec/fixtures/v1/examples/items.ndjson. They share a group, so the index builds one family with three variants from them.',
			sameHost:
				'**Feeds live on the same host as the document that lists them.** A discovery document naming a feed on another host is rejected whole, not in part — you lose the whole source, not one feed, and it counts as a definite negative, so it starts the lapse clock below. Serving the JSON from your site and the NDJSON from a separate CDN hostname is a normal thing to want and it is not supported in v1. Put both on one host.',
			firstLine: 'The first of those lines, laid out to read:',
			itemLabel: 'one org.prodid.item record',
			itemTable: 'Item record fields',
			itemFields: [
				'Always org.prodid.item.',
				'Your stable name for this record inside the feed. Publishing the same key again replaces it.',
				'The brand as it appears on the product. It is normalized before it scopes an mpn, so ARÇELİK and Arçelik are one brand, not two.',
				'The product name, without the variant axes.',
				'At least one { scheme, value }, and at least one the index can store. Values carry no whitespace at either end and are not blank. A gtin must be 8, 12, 13 or 14 digits with a correct check digit and not all zeros; an mpn needs a brand that normalizes to something, because that is the scope it is unique within; a restricted-circulation gtin is kept, but only as your own rcn. A record left with nothing storable identifies nothing and is skipped.',
				'BCP 47 tag for the human-readable text in this record.',
				'Your own grouping key. Items that share one are variants of a single family.',
				'The axes that distinguish this item within the group: color, size, capacity.',
				'GS1 GPC brick code, written gpc: followed by eight digits.',
				'ISO 3166-1 alpha-2 codes of the markets this item is sold in.',
				'Strings, numbers, booleans, lists, or { value, unit } for a measurement.',
				'Up to 20 https URLs, each with a kind and an SPDX license from the ingestible list. Unlike feeds, these may be on any host.',
			],
			flat: 'Send flat items. You never build families or variants yourself and you never send an `opid` — the index derives the first from `group` and assigns the second. If you already produce a Google Merchant feed, `group` is your `item_group_id`.',
			barcodes:
				"Two things about barcodes are worth knowing before you export. A `gtin` of all zeros is not a barcode, it is a catalogue placeholder, and a record carrying one is rejected like a bad check digit. A [restricted circulation number](/spec#which-gtins-are-identifiers) — the in-store ranges — is stored and attributed to you, but it identifies nothing globally, so it never merges your product with anyone else's and `/01/` will not resolve it.",
			step3: 'Step 3 — Claim the identity in DNS',
			step3Lead: 'Once the files are up, publish one record naming your own domain as the host.',
			step3Why:
				'It points at exactly what discovery would have found anyway, so nothing about your data changes. What changes is what someone with add-only access to your DNS can do. With no record, a record they add takes your identity over silently, because DNS wins over the file. With your record already there, a second one makes discovery fail with *more than one record* — a lapse, which is visible, notified and recoverable.',
			neverDelegate:
				'**Never delegate `_prodid` to a vendor.** Write access to `_prodid.<domain>` is control of your identity, exactly as it is for DKIM or an ACME DNS-01 challenge. A domain whose DNS is shared is an identity that is shared. Give an agency the feed, not the record.',
			order:
				'Put the files up before the record, not after: a record pointing at a document that is not there yet is a failed discovery. Values are read case-insensitively and one trailing dot is fine, so `ACME.Example.` and `acme.example` are the same host.',
			step4: 'Step 4 — Tell the index it changed',
			step4Lead: 'Optional. Every known domain is re-crawled on a schedule, and a ping only makes the next crawl happen sooner.',
			pingLabel: 'ask the index to run discovery now',
			ping: '`{"domains": [...]}` takes up to 1000 at once, which is how a platform introduces every merchant it hosts. There is no key to send, because the ping gives the caller no say over content — and `202` is all it ever says. It does not tell you whether the domain was known, whether anything was found or whether anyone else pinged it a minute ago. A `429` means only that *you* are over your own request budget, and errors come back as `application/problem+json`. What happened to your domain shows up in your [source status](#after), not in the ping.',
		},
		delegated: {
			eyebrow: 'Route 2',
			heading: 'Delegate the hosting, keep the identity',
			lead: 'Plenty of manufacturers own a domain and cannot put a file on it. The feed is hosted somewhere else and the domain proven with DNS, so the source identity is still the domain and the trust level still `verified`. Create a site at [publish.prodid.org](https://publish.prodid.org/), enter your domain, and it shows the exact record to add and checks it for you.',
			looks: 'What it looks like',
			steps: [
				'**A catalogue uploaded at a hosted slug** — say `acme.prodid.org` — which serves both the discovery document and the feed.',
				'**One TXT record on the domain you own**, naming that host. A host, never a URL, so a record can never aim the crawler at an arbitrary address.',
				"**A document that names your domain back.** DNS says *my document is over there*; the document says *I speak for that domain*. A delegated document without `domain` is rejected — absence is never read as consent, which is what stops anyone pointing a record at somebody else's feed.",
			],
			caption:
				'From spec/fixtures/v1/examples/prodid.delegated.json. The only difference from route 1 is the domain field, and here it is mandatory.',
			window:
				'The hosted publisher writes `domain` into the document only after it has seen your TXT record itself, so there is no window in which a document claims a domain that has not asked for it.',
		},
		hosted: {
			eyebrow: 'Route 3',
			heading: 'Publish without a domain',
			lead: 'A producer with no domain at all publishes at a hosted slug, `<slug>.prodid.org`, under its own name. Claim one at [publish.prodid.org](https://publish.prodid.org/). The source identity is the slug host and the trust level `unverified`, because nothing has been proven about a domain. The records are real records: identifiers, resolution, attribution.',
			merchant:
				'Most publishers in this position already keep a [Google Merchant](https://support.google.com/merchants/answer/7052112) product file, so the mapping from one of those to `org.prodid.item` records is written out in the specification, column by column, along with what it deliberately drops: price, availability, shipping and condition belong to a seller on a day, not to the product. [Importing a Merchant feed](/spec#appendix-importing-a-merchant-feed) is worth reading before you export: publish.prodid.org converts the CSV or TSV you upload with exactly that mapping. Four things in it decide what your spreadsheet has to look like:',
			rules: [
				'**Four columns become variant axes** — `color`, `size`, `material` and `pattern`, the ones a buyer picks between within one `item_group_id`. `gender`, `age_group`, `size_type` and `size_system` stay ordinary properties: they describe the whole group, and as axes they would split one product into several the first time somebody spelled one of them two ways.',
				'**A repeated attribute is comma-separated or repeated-header, per file, not per cell.** A cell is split on commas only when its header appears once in the whole file; repeat the header and every cell under it is taken whole. That is the only way to carry a value with a comma in it, and it is a decision you make once for the file. It applies to `additional_image_link`, `product_type`, `product_highlight`, `product_detail` and `certification`; everything else, a `description` full of commas included, is taken whole either way.',
				'**A `product_detail` never overwrites anything.** Its middle sub-attribute becomes the property key, the section name is dropped, and the first value for a key wins. A later detail with the same key, or one that lands on a key the mapping already produced, is dropped and reported with its row — so a detail column can never quietly redefine what the rest of the row said.',
				'**A media licence has to be declared.** The Merchant format has no column for one and [nothing is ingested without one](/spec#licences-that-can-be-ingested), so an import declares a single ingestible SPDX identifier covering every image and document in the file. A `license` column of your own overrides it row by row, and a file whose declared licence is not ingestible produces records without media rather than records that fail.',
			],
			skipped:
				'A row that cannot become a record — no usable identifier, a GTIN that fails its check digit — is skipped and reported by spreadsheet row number, header counted as row 1, so one bad row costs that row and not the import. There is a worked file to check yourself against in [`/spec/fixtures/merchant`](/spec/fixtures/merchant): a CSV, the records it must produce, and the row that must be skipped.',
			later:
				'The part that matters for a decision made today is what happens later. Adding a TXT record on a domain you acquire, naming that same host, turns the slug into the domain at the next crawl — **the same source, the same records, every `opid` kept**, with trust rising from `unverified` to `verified`. Your `sku` identifiers are scoped to the source itself rather than to its name, so they survive the move. On publish.prodid.org that is the same domain field route 2 uses.',
		},
		trust: {
			heading: 'What trust means here',
			lead: 'Trust is a property of the source, not of a claim. It says what has been proven about who is speaking, and nothing about whether a particular fact is correct. A consumer of the data decides what to do with that.',
			table: 'Trust levels',
			level: 'Level',
			meaning: 'Meaning',
			levels: [
				'Domain control proven and ownership of the brand confirmed.',
				'Domain control proven, by the TXT record or by the domain serving the document.',
				'A hosted slug with no domain, a dataset import, or a community contribution.',
			],
			only: "Only a source whose identity is a domain can be more than `unverified`. `verified` comes from the crawl. `authoritative` does not, because no crawl can prove who owns a brand: the index's operator grants it, and only on evidence.",
			rules: [
				{
					title: 'The evidence is your GS1 company prefix.',
					body: "The GS1 company prefix of the GTINs your source publishes under the brand must be licensed to the organization that controls your domain, as GS1's public “Verified by GS1” lookup shows. The URL of that lookup is kept with the grant as its evidence.",
				},
				{
					title: 'A grant names one brand, and each can be revoked.',
					body: 'The brand is recorded in its [normalized](/spec#brand-normalization) form. A source may hold grants for several brands, and the operator revokes each on its own.',
				},
				{
					title: 'A grant does not outlive the proof under it.',
					body: 'Your source is `authoritative` exactly while control of its domain is proven, it is not [lapsed](/spec#lapse), and it holds at least one grant that has not been revoked. Lose the domain proof or lapse, and it drops at once to what its remaining proof supports — `verified` while lapsed, lower if the domain proof is gone too — with no one acting. It is `authoritative` again as soon as all three hold again.',
				},
				{
					title: 'It covers the source, not the brand.',
					body: 'Trust stays a property of the source: a grant for one brand makes every claim your source makes `authoritative`, including claims about brands it holds no grant for.',
				},
			],
			ask: `To ask for it, publish on your own domain first, then [ask with the request form](${CONTACT.authoritative}), naming your domain, the brand and a Verified by GS1 lookup for one of its GTINs. The operator checks the GTINs your source publishes under that brand in Verified by GS1. The issue is public.`,
		},
		after: {
			heading: 'After you publish',
			edit: {
				title: 'Changing a record is editing a line.',
				body: 'Publishing a record with a key that already exists replaces the previous one. There is no update endpoint, because the feed is the state.',
			},
			remove: {
				title: 'Removing a line withdraws your claims, not the product.',
				body: "A key that disappears from a feed the crawler fetched whole marks your claims about it as withdrawn. The entity and its identifier stay: other people's links to it keep working, and so do the claims other sources made.",
			},
			retire: {
				title: 'Removing a feed URL from the document retires it immediately.',
				body: 'When a crawl reads a document that no longer names one of your feed URLs, every live record that feed carried is withdrawn at once, as if all of its keys had vanished, and the URL is not fetched again. None of the seven-day grace below applies: dropping a URL is you saying the file is gone, and the index takes you at your word. Listing it again later brings it back, read from scratch. Serve the document with an `ETag` if you can — a `304` means the list has not changed, so it retires nothing.',
			},
			broken: {
				title: 'A broken line delays withdrawal for seven days; it does not disable it.',
				body: "A line that is over 64 KiB, unparseable or invalid is skipped and counted. Because a skipped line's key is unknown, a feed with skipped lines withdraws nothing — for seven days. After that, absent keys are withdrawn as usual. The count is public, so a feed quietly shedding lines is not quiet.",
			},
			unreadable: {
				title: 'A feed the crawler cannot read is not free.',
				body: 'A crawl succeeds only when *everything the document lists* was read: an acceptable document, and every feed in it answering `200` or `304`. One feed timing out does not lose you the others — the feeds that answered are ingested, and nothing is withdrawn on a crawl that failed — but the crawl counts as a transport failure, and `feeds_failed` says so in your status. A perfectly healthy document in front of one permanently dead feed URL therefore lapses on the same seven-day clock as a domain that stopped answering altogether, and loses the catalogue thirty days after that. A feed URL you no longer serve should be removed from the document, not left to rot.',
			},
			lapse: {
				title: 'If discovery stops succeeding, your source lapses.',
				body: [
					'A **definite negative** — discovery ending with no acceptable document: no record and no document, a record that is malformed, over-long or duplicated, or a document that is not 200, not JSON, not valid, no longer agrees about `domain`, or lists a feed off its host — lapses the source at once. A **transport failure** — a DNS timeout, a 5xx, a 429, a cap reached, on the document or on any feed — changes nothing by itself, but seven consecutive days in which every attempt ends that way lapse you too, so serving errors forever is not a way to freeze your claims where they are.',
					'**That benefit of the doubt belongs to a host, not to you.** It applies only at a host your source has already been verified at. At a host it has never been verified at — a new slug, a host you have just re-pointed `_prodid` at, anything under routes 2 and 3 — any failure, a timeout and a 5xx included, is a definite negative and lapses you at once. That is deliberate: otherwise a verified source could aim its record at a host it does not control and read back, from whether its lapse starts today or in a week, whether that host is up. Moving hosts costs you nothing for it. The first crawl that succeeds at the new host clears everything, and a lapse stays recoverable for the 30 days before anything is withdrawn.',
					'A lapsed source takes no new claims, is shown as lapsed to readers, and its `publisher.contact` is notified. A crawl of a lapsed source writes nothing until it has succeeded in full; only then is the lapse cleared. After 30 days of continuous lapse your **records and their active claims are withdrawn together**, and remain as history. Those 30 days are your recovery window, which is why the contact address has to be one somebody reads.',
					'Coming back does not require changing anything. Serve the same document and the same feed you always did and everything you publish is asserted again the moment discovery succeeds, whether or not a byte moved — the index gives up conditional requests while it holds nothing live from you, so an unchanged file is never a reason to stay withdrawn.',
				],
			},
			seen: {
				title: '`seen_at` is a continuous assertion, and a long lapse resets it.',
				body: 'Every claim a reader sees carries `seen_at`: not when the fact was first published anywhere, but *since when this source has asserted this value without stopping*. It survives every re-crawl that finds the same value, which is the point of it. It does not survive a withdrawal. Let your source stay lapsed past 30 days and the date on every fact you publish restarts from the day you come back, because for the length of the gap nobody verifiable stood behind them. The withdrawn rows stay, so `?history=1` shows the gap rather than hiding it — [what a reader sees](/spec#an-entity) is in the specification.',
			},
			status: {
				title: 'Your source has a public status page.',
				body: '`/source/acme.example` is how you see that something is wrong: the outcome of the last crawl, which path discovery took, how many records changed, how many lines were skipped, how many feeds could not be read, and whether you are lapsed and since when. It reports only what your domain publishes and when the index looked — never who asked for a crawl.',
			},
			media: {
				title: 'Media is sniffed, not trusted — and a bad entry costs only itself.',
				sniffed:
					"The type is decided by reading the bytes; your `Content-Type` is a hint. Six types are stored and nothing else: JPEG, PNG, GIF, WebP and AVIF as `image`, PDF as `document`. No SVG, no HTML, no archives, no Office files — a spec sheet goes out as a PDF. The sniffed type and the entry's `kind` have to agree, or the entry is skipped.",
				table: 'Media caps',
				what: 'What',
				cap: 'Cap',
				caps: ['One image', 'One document', 'One media fetch', 'Media entries in one record'],
				licence:
					'The licence is checked as a string before anything is fetched, and it must be exactly one of seven SPDX identifiers — the ones that let anyone redistribute the file verbatim, which is what the index does with it:',
				licences: 'ingestible media licences',
				entry:
					'Everything here is per entry. An entry that is refused, too big or unreachable costs that entry and nothing else: **your record is never invalid because of its media**, its other claims stand, and no media failure lapses you. It is counted in `media_failed` and tried again on the next crawl of that record. One thing works the other way from feeds: the same-host rule does *not* apply here, so your images can live on a CDN. [What is ingested](/spec#what-is-ingested) and [the licence list](/spec#licences-that-can-be-ingested) have the reasoning.',
			},
			others: {
				title: 'Other sources will publish about your products.',
				body: 'Retailers, registries, open datasets and contributors are sources like any other. Their claims are attributed to them and never overwrite yours; where you disagree, both claims are visible with their sources side by side.',
			},
		},
		checklist: {
			heading: 'Before you go live',
			items: [
				'Discovery answers with HTTP 200, a JSON content type and a body that validates against the feed schema — not an HTML “page not found” served with a 200.',
				'There is exactly one v=prodid0 TXT record at _prodid.<your domain>. Two is an error, and a malformed one is an error.',
				'That record is v=prodid0; host=<hostname>. A host, never a URL: no scheme, no port, no path.',
				'Every URL in feeds is https and on the same host as the discovery document that lists it.',
				'Every URL in feeds is one you still serve. A feed that cannot be fetched fails the whole crawl, and seven days of that lapses the source.',
				'A delegated document carries "domain", equal to the domain it speaks for.',
				'The discovery document is served as application/json and does not redirect to another host.',
				'Feeds and documents send ETag or Last-Modified, so an unchanged file costs a 304.',
				'Every feed line is one complete JSON object under 64 KiB, UTF-8, newline separated, no array wrapper and no trailing commas.',
				'Every key is stable and is never reused for a different product.',
				'Every gtin is digits only, with a correct check digit, and is not all zeros.',
				'Every identifier value is trimmed — no leading or trailing whitespace — and every record keeps at least one identifier the index can store, which means an mpn needs a brand.',
				'Every media entry has a kind that matches its actual bytes and one of the seven ingestible SPDX licences, or that entry is skipped.',
				'No record contains an opid. The index assigns those.',
				'publisher.contact is an address somebody reads.',
			],
			check: 'Check your files before you ping',
			checkLead:
				'`prodid-batch check` validates your discovery document and each feed exactly as the index would, with no token and without asking the index anything. It runs from a clone of the repository with [Bun](https://bun.sh) 1.4.4. Give it the files themselves: a path ending in `.json` is read as one document, any other path as an NDJSON feed.',
			checkLabel: 'validate what you serve, as the index will',
			checkResult:
				'A file with no problem prints `ok` and the number of records the index would take from it. Otherwise it prints one line per problem, as `items.ndjson:12: message` with the feed line it is on, and exits non-zero. It reads the files, not your DNS or your server, so the TXT record, the content type and the caching headers in the list above are still yours to check.',
			rules:
				'The rules a record is validated against are in the [specification](/spec), the schemas are served at [`/spec/schemas/v1`](/spec/schemas/v1), and [`/spec/fixtures/v1`](/spec/fixtures/v1) holds machine-readable vectors you can run your exporter against before anyone crawls it.',
			status: 'Status:',
			formats: 'The file formats on this page are the ones the index reads when you ping it.',
		},
	},

	data: {
		title: 'Open data — prodid',
		description:
			'Download the whole prodid index: a nightly dump of every source, entity, record, grouping and merge as gzip NDJSON, under CC0 for what the index makes and each source’s own licence for its claims.',
		eyebrow: 'Open data',
		heading: 'Download the index',
		lead: 'The index is replaceable. Everything it knows that a reader may know is published as a full export, a dump, that anyone can download and load into an index of their own.',
		latest: {
			heading: 'The latest dump',
			before: 'When this page was built, the newest dump was the snapshot taken at',
			after: '. A new one is written every night at 04:30 UTC, and',
			names: 'always names the newest.',
			lines: (count: string, one: boolean) => `${count} ${one ? 'line' : 'lines'}`,
			per: (what: string) => `One line per ${what}.`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`This dump’s directory is \`${directory}\`, and its manifest is [\`manifest.json\`](${manifest}), written at ${created}. Its licences read \`index: ${index}\` and \`claims: ${claims}\`.`,
		},
		holds: {
			'sources.ndjson.gz': { per: 'source', line: 'The source’s status, exactly as /source/{name} answers it.' },
			'entities.ndjson.gz': {
				per: 'entity, merged ones included',
				line: 'The entity document exactly as /id/{opid}?history=1 answers it, withdrawn claims included.',
			},
			'records.ndjson.gz': {
				per: 'record, withdrawn ones included',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: 'grouping', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: 'merge, reverted ones included', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: 'Where dumps are kept',
			lead: 'A dump is a directory named after the UTC date of its snapshot, under the version it is written in. `v1/` holds v1 dumps, whose manifest and whose source and entity lines are v1 documents. It holds five data files and a manifest.',
			last: '**latest.json is written last.** It is a copy of the newest dump’s `manifest.json`, written after every file of that dump and its manifest are in place. A reader that starts from it never finds a manifest naming a file that is not there yet, and finds the directory from the manifest’s own `snapshot_at`.',
			retention:
				'**Retention.** A daily dump is kept for 7 days. The first dump of each UTC month is kept for good. A dump that is kept is never rewritten: its directory, its files and its manifest stay byte for byte as they were.',
			v0: (dumps: string, latest: string) =>
				`**v0 dumps.** The v0 dumps written before v1 stay under \`${dumps}\`, under the same retention, and [\`v0/latest.json\`](${latest}) keeps naming the last of them. They validate against the v0 schemas for good.`,
			manifest: (schema: string) =>
				`**The manifest.** It names each of the five files exactly once, with the SHA-256 and the size of the file as served, compressed, and its number of lines once decompressed. Check each file against its digest before you load it. The schema is [\`${schema}\`](${schema}), with vectors in [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump).`,
		},
		files: {
			heading: 'What each file holds',
			lead: 'Every file is NDJSON compressed with gzip, one JSON object per line. All five are read from one consistent snapshot, so they agree with each other: every source a line names has its line in `sources.ndjson.gz`, and every `opid` a line names has its line in `entities.ndjson.gz`.',
			table: 'Dump files',
			columns: ['File', 'One line per', 'The line'],
			merged: 'Entities that were merged',
			mergedBody:
				'An `opid` that was merged answers `308` at the resolver, so it has no document of its own to copy. Its line is the document it would answer were it not merged — its own identifiers and claims stay on it, which is what makes a merge reversible — with one more member, `merged_into`, the `opid` of its survivor. Merges do not chain: the survivor is never itself merged.',
			record: 'A record line',
			recordLead: 'One record as the index keeps it. Every time is UTC, ISO 8601.',
			recordTable: 'Record line fields',
			recordColumns: ['Field', 'What it is'],
			recordFields: [
				'The source’s name.',
				'The record’s key in that source.',
				'The URL of the feed it was read from. Absent for a record a dataset import wrote.',
				'The item it resolved to.',
				'The org.prodid.item the publisher sent, unchanged.',
				'When the index first read it.',
				'When the index last read it.',
				'Present exactly when the record is withdrawn.',
			],
			grouping: 'A grouping line',
			groupingLead:
				'Which entity a source’s grouping resolved to. `kind` is `family` or `variant`, and `key` is what the source’s records are grouped on, written out rather than digested, so that another implementation can match its own grouping to it.',
			groupingNotes: [
				'for a publisher group; { "key": "<key>" } for a record with no group, which is a family of its own.',
				'the record’s variant, {} when it has none.',
			],
			familyKey: '{ "family": <the family’s key>, "variant": { <axis>: <value>, … } }',
			merge: 'A merge line',
			mergeBody:
				'One merge decision: `from` the merged `opid`, `into` its survivor, `decided_at` when it was made, and `reverted_at`, present exactly when it was reverted.',
		},
		never: {
			heading: 'What a dump never holds',
			lead: 'A dump says no more than the resolver already does, plus the records, groupings and merges its answers are built from.',
			items: [
				'A publisher’s contact address, which the index keeps only to send the lapse notice.',
				'The crawl log, the crawler’s error text, or anything else about a crawl that the source’s status does not show.',
				'Why a merge was made or who decided it.',
				'Why a media hash was blocked.',
				'Media bytes. A media claim’s media_url addresses the file, and a blocked hash is not served.',
				'The index’s internal row identifiers. Every line names a source by its name and an entity by its opid.',
				'The grants of authority and their evidence. A source’s line says authoritative if it was at snapshot_at, but an index loaded from the dump holds no grant until its own operator makes one.',
			],
		},
		licences: {
			heading: 'Licences',
			lead: 'Two rules, and the manifest’s `licenses` states both.',
			index: 'Everything the index makes',
			indexBody: '`opid`s, the identifier mappings, the family and variant hierarchy, groupings and merges.',
			claims: 'Every claim and every record',
			claimsBody:
				'Under the licence its own source declares: the `license` of that source’s line in `sources.ndjson.gz`. A source that declares none has granted nothing, and prodid grants nothing on its behalf.',
			datasets:
				'An open dataset that publishes no discovery document of its own enters the index as a source named `dataset:<slug>`, imported by the index’s operator from the dataset’s public export. Such a source is always `unverified`, and its `license` is the dataset’s own. The rules are in the [specification](/spec#dataset-sources).',
		},
		load: {
			heading: 'Load it into your own index',
			lead: '`prodid-batch load-dump` loads a v0 or v1 dump into an empty PostgreSQL 18 database migrated to the same version, in one transaction. It takes a dump’s dated directory, its `manifest.json`, or a `latest.json`, local or over HTTPS.',
			label: 'from a clone of the repository',
			checked:
				'Every file is checked against the manifest’s `sha256`, `bytes` and `lines` before anything is written, and a remote dump is downloaded to a temporary directory first. A database that is not empty is refused. `PRODID_OPERATOR` is recorded as the decider of the loaded merges.',
			peek: 'To read a file without loading it, check it against its digest and decompress it. The digest below is the one in the latest manifest when this page was built.',
			rules: 'The full rules are in the specification under [Dumps](/spec#dumps).',
		},
	},
} as const

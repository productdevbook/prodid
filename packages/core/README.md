# @prodid/core

The reference rules of the [prodid](https://prodid.org) protocol as pure TypeScript: GTIN and
identifier normalisation, opid, record validation against the JSON Schemas, claims, discovery,
NDJSON and delimited readers, Merchant and dataset mappings, canonical JSON.

No network, clock, filesystem or globals: it runs in Node, Bun, Workers and browsers. ESM only.

```sh
npm install @prodid/core
```

```ts
import { readNdjson, validateFeed, validateItem } from '@prodid/core'

const feed = validateFeed(await (await fetch('https://acme.example/.well-known/prodid.json')).json())
if (!feed.ok) throw new Error(feed.errors.map((error) => `${error.path} ${error.message}`).join('\n'))

for (const url of feed.value.feeds) {
	const response = await fetch(url)
	if (!response.body) continue
	for await (const entry of readNdjson(response.body)) {
		const item = entry.ok ? validateItem(entry.value) : entry
		console.log(entry.line, item.ok ? item.value.key : item)
	}
}
```

A document is validated against the schema its own `version` names; pass `{ version }` to pin one.

The protocol is specified at [prodid.org/spec](https://prodid.org/spec). Licensed Apache-2.0.

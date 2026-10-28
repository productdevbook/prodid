#!/usr/bin/env bun
import { basename, extname } from 'node:path'
import { parseArgs } from 'node:util'

import type { MerchantDeclaration } from '@prodid/core'

import { checkDocument, checkFeed, type CheckResult, formatProblem } from './check'
import { convertMerchant, type MerchantConversion } from './merchant'
import { databaseEnv, MergeError, mergeEnv, parseOpid, parseReason, runMerge, runUnmerge } from './merge'
import { OperatorClient, OperatorError, type SiteSettings } from './operator'
import { parseDigest, runBlockMedia, TakedownError, takedownEnv } from './takedown'

const USAGE = `prodid-batch <command>

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

block-media, merge and unmerge print the database host first and write to it directly.

site, feed, publish, assign, verify, show, remove-feed and remove-site call the operator endpoint,
PRODID_OPERATOR_URL (default https://publish.prodid.org), authenticated with PRODID_OPERATOR_TOKEN.`

const OPTIONS = {
	license: { type: 'string' },
	lang: { type: 'string' },
	market: { type: 'string', multiple: true },
	out: { type: 'string' },
	publisher: { type: 'string' },
	contact: { type: 'string' },
	domain: { type: 'string' },
	name: { type: 'string' },
	reason: { type: 'string' },
	help: { type: 'boolean', short: 'h' },
} as const

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>['values']

class UsageError extends Error {}

async function main(argv: string[]): Promise<void> {
	const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
	const [command, ...rest] = positionals
	if (values.help === true || command === undefined) {
		console.log(USAGE)
		return
	}

	switch (command) {
		case 'merchant': {
			const conversion = await convert(need(rest[0], 'file'), values)
			if (values.out === undefined) process.stdout.write(conversion.ndjson)
			else await Bun.write(values.out, conversion.ndjson)
			return
		}
		case 'check': {
			need(rest[0], 'file')
			let failed = false
			for (const path of rest) {
				const result = await check(path)
				for (const problem of result.problems) console.log(formatProblem(path, problem))
				if (result.problems.length > 0) failed = true
				else console.log(`${path}: ok, ${result.records} ${result.records === 1 ? 'record' : 'records'}`)
			}
			if (failed) process.exitCode = 1
			return
		}
		case 'site':
			print(await operator().putSite(need(rest[0], 'slug'), settings(values)))
			return
		case 'feed': {
			const path = need(rest[1], 'file')
			const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
			print(await operator().putFeed(need(rest[0], 'slug'), values.name ?? basename(path), bytes))
			return
		}
		case 'publish': {
			const slug = need(rest[0], 'slug')
			const path = need(rest[1], 'file')
			const conversion = await convert(path, values)
			const client = operator()
			await client.putSite(slug, settings(values))
			print(await client.putFeed(slug, values.name ?? `${stem(path)}.ndjson`, conversion.ndjson))
			if (values.domain !== undefined) print(await client.verify(slug))
			return
		}
		case 'assign':
			print(await operator().assign(need(rest[0], 'slug'), need(rest[1], 'email')))
			return
		case 'verify':
			print(await operator().verify(need(rest[0], 'slug')))
			return
		case 'show':
			print(await operator().showSite(need(rest[0], 'slug')))
			return
		case 'remove-feed':
			await operator().removeFeed(need(rest[0], 'slug'), need(rest[1], 'name'))
			return
		case 'remove-site':
			await operator().removeSite(need(rest[0], 'slug'))
			return
		case 'block-media': {
			const sha256 = parseDigest(need(rest[0], 'sha256'))
			const reason = need(values.reason, '--reason').trim()
			if (reason === '') throw new UsageError('--reason is empty')
			const env = takedownEnv(process.env)
			if (!(await runBlockMedia(env, { sha256, reason, now: new Date() }))) process.exitCode = 1
			return
		}
		case 'merge': {
			const from = parseOpid(need(rest[0], 'from-opid'))
			const into = parseOpid(need(rest[1], 'into-opid'))
			const reason = parseReason(need(values.reason, '--reason'))
			await runMerge(mergeEnv(process.env), { from, into, reason, now: new Date() })
			return
		}
		case 'unmerge': {
			const from = parseOpid(need(rest[0], 'from-opid'))
			await runUnmerge(databaseEnv(process.env), { from, now: new Date() })
			return
		}
		default:
			throw new UsageError(`unknown command ${command}`)
	}
}

function check(path: string): Promise<CheckResult> {
	const file = Bun.file(path)
	return extname(path) === '.json' ? file.text().then(checkDocument) : checkFeed(file.stream())
}

async function convert(path: string, values: Values): Promise<MerchantConversion> {
	const declared: MerchantDeclaration = { license: need(values.license, '--license') }
	if (values.lang !== undefined) declared.lang = values.lang
	if (values.market !== undefined) declared.markets = values.market
	const conversion = await convertMerchant(Bun.file(path).stream(), declared)
	for (const row of conversion.skipped) console.error(`row ${row.row} skipped: ${row.reason}`)
	for (const row of conversion.dropped) console.error(`row ${row.row} dropped: ${row.values.join(', ')}`)
	console.error(`${conversion.items} items, ${conversion.skipped.length} rows skipped`)
	if (conversion.items === 0) throw new UsageError('no row became an item')
	return conversion
}

function settings(values: Values): SiteSettings {
	const publisher: SiteSettings['publisher'] = { name: need(values.publisher, '--publisher') }
	if (values.contact !== undefined) publisher.contact = values.contact
	const result: SiteSettings = { publisher, license: need(values.license, '--license') }
	if (values.domain !== undefined) result.domain = values.domain
	return result
}

function operator(): OperatorClient {
	const token = process.env.PRODID_OPERATOR_TOKEN
	if (token === undefined || token === '') throw new UsageError('PRODID_OPERATOR_TOKEN is not set')
	return new OperatorClient(process.env.PRODID_OPERATOR_URL ?? 'https://publish.prodid.org', token)
}

function need<T>(value: T | undefined, what: string): T {
	if (value === undefined) throw new UsageError(`missing ${what}`)
	return value
}

function stem(path: string): string {
	return (
		basename(path)
			.replace(/\.[^.]*$/, '')
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'items'
	)
}

function print(value: unknown): void {
	console.log(JSON.stringify(value, null, 2))
}

main(process.argv.slice(2)).catch((error: unknown) => {
	if (error instanceof UsageError) console.error(`${error.message}\n\n${USAGE}`)
	else if (error instanceof OperatorError || error instanceof TakedownError || error instanceof MergeError) console.error(error.message)
	else console.error(error)
	process.exit(1)
})

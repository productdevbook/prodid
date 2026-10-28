import { sha256Hex } from '@prodid/core'

import type { Sql } from './sql'

export const LINK_MINUTES = 15
export const SESSION_DAYS = 30
export const LINKS_PER_EMAIL = 5
export const LINKS_PER_CLIENT = 20
export const SESSION_COOKIE = '__Host-session'
export const FORM_COOKIE = '__Host-form'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export interface Account {
	id: string
	email: string
}

export function normalizeEmail(raw: string): string | null {
	const email = raw.trim().toLowerCase()
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
	return email
}

/** The /32 of an IPv4 address or the /64 of an IPv6 one: one subscriber, whatever its device picks. */
export function addressPrefix(address: string): string {
	if (!address.includes(':')) return address
	const halves = address.toLowerCase().split('::')
	const left = halves[0] ? halves[0].split(':') : []
	const right = halves.length > 1 && halves[1] ? halves[1].split(':') : []
	const groups = [...left, ...right].reduce((count, group) => count + (group.includes('.') ? 2 : 1), 0)
	const expanded = [...left, ...Array.from({ length: Math.max(8 - groups, 0) }, () => '0'), ...right]
	return `${expanded
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`
}

export function clientKey(address: string): Promise<string> {
	return sha256Hex(addressPrefix(address))
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '')
}

/**
 * Stores a new link unless the email or the client asked for five or twenty in the last hour. A
 * link made at t expires at t + 15 minutes, so "made in the last hour" is "expires after now − 45
 * minutes"; rows older than that count for nothing and are dropped.
 */
export async function requestLink(sql: Sql, email: string, client: string, now: Date): Promise<string | null> {
	const window = new Date(now.getTime() - HOUR + LINK_MINUTES * MINUTE).toISOString()
	await sql.run('delete from login_token where expires_at <= ?', window)
	const token = randomToken()
	const inserted = await sql.run(
		`insert into login_token (hash, account_email, client, expires_at)
		 select ?, ?, ?, ?
		 where (select count(*) from login_token where account_email = ? and expires_at > ?) < ?
		   and (select count(*) from login_token where client = ? and expires_at > ?) < ?`,
		await sha256Hex(token),
		email,
		client,
		new Date(now.getTime() + LINK_MINUTES * MINUTE).toISOString(),
		email,
		window,
		LINKS_PER_EMAIL,
		client,
		window,
		LINKS_PER_CLIENT,
	)
	return inserted === 1 ? token : null
}

/** Marks the link used in the same statement that checks it, so two clicks cannot both sign in. */
export async function consumeLink(sql: Sql, token: string, now: Date): Promise<string | null> {
	const at = now.toISOString()
	const link = await sql.first<{ account_email: string }>(
		'update login_token set used_at = ? where hash = ? and used_at is null and expires_at > ? returning account_email',
		at,
		await sha256Hex(token),
		at,
	)
	if (link === null) return null
	const account = await sql.first<{ id: string }>(
		`insert into account (id, email, created_at, last_sign_in_at) values (?, ?, ?, ?)
		 on conflict (email) do update set last_sign_in_at = excluded.last_sign_in_at
		 returning id`,
		crypto.randomUUID(),
		link.account_email,
		at,
		at,
	)
	if (account === null) return null
	const session = randomToken()
	await sql.run('delete from session where expires_at <= ?', at)
	await sql.run(
		'insert into session (hash, account_id, created_at, expires_at) values (?, ?, ?, ?)',
		await sha256Hex(session),
		account.id,
		at,
		new Date(now.getTime() + SESSION_DAYS * 24 * HOUR).toISOString(),
	)
	return session
}

export async function sessionAccount(sql: Sql, session: string, now: Date): Promise<Account | null> {
	return sql.first<Account>(
		'select account.id, account.email from session join account on account.id = session.account_id where session.hash = ? and session.expires_at > ?',
		await sha256Hex(session),
		now.toISOString(),
	)
}

export async function endSession(sql: Sql, session: string): Promise<void> {
	await sql.run('delete from session where hash = ?', await sha256Hex(session))
}

/** A form token derived from a cookie the page cannot read, so another site cannot forge it. */
export function formToken(cookie: string): Promise<string> {
	return sha256Hex(`form\n${cookie}`)
}

export function sessionCookie(value: string): string {
	return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_DAYS * 24 * 3600}; Path=/; Secure; HttpOnly; SameSite=Lax`
}

export function clearedSessionCookie(): string {
	return `${SESSION_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`
}

export function formCookie(value: string): string {
	return `${FORM_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`
}

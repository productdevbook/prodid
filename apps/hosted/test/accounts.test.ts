import { describe, expect, test } from 'bun:test'

import { memorySql } from './sql'

describe('accounts database', () => {
	test('has the tables of chapter 06', async () => {
		const sql = memorySql()
		const tables = await sql.all<{ name: string }>("select name from sqlite_master where type = 'table' order by name")
		expect(tables.map((table) => table.name)).toEqual(['account', 'login_token', 'session', 'sign_in', 'site'])
		const columns = async (table: string) => (await sql.all<{ name: string }>(`pragma table_info(${table})`)).map((column) => column.name)
		expect(await columns('account')).toEqual(['id', 'email', 'created_at', 'last_sign_in_at'])
		expect(await columns('login_token')).toEqual(['hash', 'account_email', 'client', 'expires_at', 'used_at'])
		expect(await columns('session')).toEqual(['hash', 'account_id', 'created_at', 'expires_at'])
		expect(await columns('sign_in')).toEqual(['account_id', 'at'])
		expect(await columns('site')).toEqual(['slug', 'account_id', 'created_at', 'deleted_at', 'checked_at', 'reminded_at'])
	})

	test('keeps one account per email', async () => {
		const sql = memorySql()
		await sql.run('insert into account (id, email, created_at) values (?, ?, ?)', 'a', 'x@example.com', '2026-10-28T12:00:00.000Z')
		await expect(
			sql.run('insert into account (id, email, created_at) values (?, ?, ?)', 'b', 'x@example.com', '2026-10-28T12:00:00.000Z'),
		).rejects.toThrow()
	})

	test('refuses a session without an account and drops sessions with their account', async () => {
		const sql = memorySql()
		await expect(
			sql.run('insert into session values (?, ?, ?, ?)', 'h', 'nobody', '2026-10-28T12:00:00.000Z', '2026-11-27T12:00:00.000Z'),
		).rejects.toThrow()
		await sql.run('insert into account (id, email, created_at) values (?, ?, ?)', 'a', 'x@example.com', '2026-10-28T12:00:00.000Z')
		await sql.run('insert into session values (?, ?, ?, ?)', 'h', 'a', '2026-10-28T12:00:00.000Z', '2026-11-27T12:00:00.000Z')
		expect(await sql.run('delete from account where id = ?', 'a')).toBe(1)
		expect(await sql.first('select * from session')).toBeNull()
	})
})

import { type SubmitEvent, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
	label: string
	placeholder: string
	button: string
	working: string
	invalid: string
	limited: string
	failed: string
	note: string
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function hostname(input: string): string | null {
	const value = input.trim().toLowerCase()
	if (value === '' || /[\s/:?#@\\]/.test(value)) return null
	let host: string
	try {
		host = new URL(`https://${value}`).hostname
	} catch {
		return null
	}
	const labels = host.split('.')
	if (host.length > 253 || labels.length < 2 || !labels.every((part) => LABEL.test(part)) || /^\d+$/.test(labels.at(-1) ?? '')) return null
	return host
}

export function DomainCheck({ label, placeholder, button, working, invalid, limited, failed, note }: Props) {
	const id = useId()
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	async function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault()
		const host = hostname(String(new FormData(event.currentTarget).get('domain') ?? ''))
		if (host === null) {
			setError(invalid)
			return
		}
		setError('')
		setBusy(true)
		try {
			const response = await fetch('/ping', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ domains: [host] }),
			})
			if (response.status === 202) {
				location.assign(`/source/${host}`)
				return
			}
			setError(response.status === 429 ? limited : response.status === 400 ? invalid : failed)
		} catch {
			setError(failed)
		}
		setBusy(false)
	}

	return (
		<form onSubmit={submit} noValidate className="grid gap-3">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					id={id}
					name="domain"
					dir="ltr"
					inputMode="url"
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					placeholder={placeholder}
					aria-invalid={error !== ''}
					aria-describedby={`${id}-note`}
					className="h-10 sm:max-w-80"
				/>
				<Button type="submit" size="lg" disabled={busy}>
					{busy ? working : button}
				</Button>
			</div>
			{error !== '' && (
				<p role="alert" className="text-[0.8125rem] text-destructive">
					{error}
				</p>
			)}
			<p id={`${id}-note`} className="text-[0.8125rem] text-soft">
				{note}
			</p>
		</form>
	)
}

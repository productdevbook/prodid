import type { YuvaChatElement } from 'useyuva/chat'

let loading: Promise<unknown> | undefined

export function loadChat(): Promise<unknown> {
	loading ??= import('useyuva/chat')
	return loading
}

export async function openChat(): Promise<void> {
	await loadChat()
	await document.querySelector<YuvaChatElement>('yuva-chat')?.open()
}

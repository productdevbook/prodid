import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'

interface Props {
	copy: string
	copied: string
}

function CopyButton({ host, copy, copied }: { host: HTMLElement } & Props) {
	const [done, setDone] = useState(false)

	useEffect(() => {
		if (!done) return
		const timer = setTimeout(() => setDone(false), 1600)
		return () => clearTimeout(timer)
	}, [done])

	return (
		<>
			<Button
				variant="ghost"
				size="xs"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(host.closest('figure')?.querySelector('pre')?.textContent ?? '')
					} catch {
						return
					}
					setDone(true)
				}}
			>
				{done ? <Check /> : <Copy />}
				{copy}
			</Button>
			<span role="status" className="sr-only">
				{done ? copied : ''}
			</span>
		</>
	)
}

export function CopyButtons({ copy, copied }: Props) {
	const [hosts, setHosts] = useState<HTMLElement[]>([])

	useEffect(() => {
		const scan = () => {
			const next = [...document.querySelectorAll<HTMLElement>('[data-copy-slot]')]
			setHosts((prev) => (prev.length === next.length && prev.every((host, at) => host === next[at]) ? prev : next))
		}
		scan()
		const observer = new MutationObserver(scan)
		observer.observe(document.body, { childList: true, subtree: true })
		return () => observer.disconnect()
	}, [])

	return hosts.map((host, at) => createPortal(<CopyButton host={host} copy={copy} copied={copied} />, host, String(at)))
}

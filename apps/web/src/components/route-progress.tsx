import { useEffect, useRef, useState } from 'react'

import { Progress, ProgressLabel } from '@/components/ui/progress'

interface Props {
	total: number
	label: string
	className?: string | undefined
}

export function RouteProgress({ total, label, className }: Props) {
	const root = useRef<HTMLDivElement>(null)
	const [done, setDone] = useState(0)

	useEffect(() => {
		const panel = root.current?.closest('[data-route-panel]')
		if (!panel) return
		const count = () => setDone(panel.querySelectorAll('li[data-done]').length)
		count()
		panel.addEventListener('stepchange', count)
		return () => panel.removeEventListener('stepchange', count)
	}, [])

	return (
		<div ref={root} className={className}>
			<Progress value={(done / total) * 100} className="gap-2">
				<ProgressLabel className="font-mono text-xs font-normal tracking-wide text-soft">
					{label.replace('{n}', String(done)).replace('{total}', String(total))}
				</ProgressLabel>
			</Progress>
		</div>
	)
}

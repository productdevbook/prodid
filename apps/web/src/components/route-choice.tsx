import { useEffect, useId, useState } from 'react'

import { DirectionProvider } from '@/components/ui/direction'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface Route {
	id: string
	eyebrow: string
	when: string
	who: string
}

interface Props {
	routes: Route[]
	labelledby: string
	dir: 'ltr' | 'rtl'
}

const container = () => document.querySelector<HTMLElement>('.route-switch')

export function RouteChoice({ routes, labelledby, dir }: Props) {
	const base = useId()
	const [value, setValue] = useState(routes[0]?.id ?? '')

	useEffect(() => {
		const sync = () => {
			const current = container()?.dataset.route
			if (current) setValue(current)
		}
		sync()
		addEventListener('routechange', sync)
		return () => removeEventListener('routechange', sync)
	}, [])

	return (
		<DirectionProvider direction={dir}>
			<RadioGroup
				aria-labelledby={labelledby}
				value={value}
				onValueChange={(next) => {
					setValue(String(next))
					const flow = container()
					if (flow) flow.dataset.route = String(next)
				}}
				className="mt-6 gap-3"
			>
				{routes.map((route) => (
					<Label
						key={route.id}
						htmlFor={`${base}-${route.id}`}
						className="cursor-pointer items-start gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-colors hover:border-brand/50 has-data-checked:border-brand has-data-checked:bg-brand-bg has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
					>
						<RadioGroupItem id={`${base}-${route.id}`} value={route.id} className="mt-1 size-5" />
						<span className="min-w-0">
							<span className="block font-mono text-xs font-normal tracking-[0.18em] text-soft uppercase">{route.eyebrow}</span>
							<span className="mt-1.5 block text-base leading-snug font-semibold tracking-tight">{route.when}</span>
							<span className="mt-1.5 block text-[0.9375rem] leading-relaxed font-normal text-soft">{route.who}</span>
						</span>
					</Label>
				))}
			</RadioGroup>
		</DirectionProvider>
	)
}

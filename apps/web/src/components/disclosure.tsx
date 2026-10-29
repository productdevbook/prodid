import { ChevronDown } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface Props {
	title?: ReactNode
	children: ReactNode
	id?: string | undefined
	className?: string | undefined
	triggerClassName?: string | undefined
}

export function Disclosure({ title, children, id, className, triggerClassName }: Props) {
	const root = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)

	useEffect(() => {
		const reveal = () => {
			const hash = decodeURIComponent(location.hash.slice(1))
			const target = hash ? document.getElementById(hash) : null
			if (!target || !root.current?.contains(target)) return
			setOpen(true)
			requestAnimationFrame(() => target.scrollIntoView())
		}
		reveal()
		addEventListener('hashchange', reveal)
		return () => removeEventListener('hashchange', reveal)
	}, [])

	return (
		<Collapsible
			ref={root}
			id={id}
			open={open}
			onOpenChange={setOpen}
			className={cn('rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10', className)}
		>
			<CollapsibleTrigger
				className={cn(
					'flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-5 py-3 text-start text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-panel-open:rounded-b-none [&[data-panel-open]>svg]:rotate-180',
					triggerClassName,
				)}
			>
				<span>{title}</span>
				<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
			</CollapsibleTrigger>
			<CollapsibleContent
				hiddenUntilFound
				className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
			>
				<div className="border-t px-5 py-4">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

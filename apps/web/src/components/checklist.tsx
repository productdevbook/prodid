import { useId } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function Checklist({ items }: { items: readonly string[] }) {
	const base = useId()
	return (
		<ul className="grid gap-3 [&>*]:min-w-0">
			{items.map((entry, at) => (
				<li key={at} className="flex items-start gap-3">
					<Checkbox id={`${base}-${at}`} className="mt-[0.3em]" />
					<Label htmlFor={`${base}-${at}`} className="cursor-pointer items-start text-[0.9375rem] leading-relaxed font-normal text-soft">
						{entry}
					</Label>
				</li>
			))}
		</ul>
	)
}

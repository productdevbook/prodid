import { useId, useRef } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function StepDone({ label }: { label: string }) {
	const id = useId()
	const root = useRef<HTMLDivElement>(null)

	return (
		<div ref={root} className="flex items-center gap-3">
			<Checkbox
				id={id}
				onCheckedChange={(checked) => {
					const step = root.current?.closest('li')
					if (!step) return
					step.toggleAttribute('data-done', checked)
					step.dispatchEvent(new Event('stepchange', { bubbles: true }))
				}}
			/>
			<Label htmlFor={id} className="cursor-pointer text-[0.8125rem] font-normal text-soft">
				{label}
			</Label>
		</div>
	)
}

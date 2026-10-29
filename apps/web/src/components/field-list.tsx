import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Need = 'yes' | 'no' | 'delegating'

interface Field {
	field: string
	need: Need
	required: string
	note: string
}

interface Props {
	label: string
	tag: string
	fields: Field[]
	className?: string | undefined
}

const badge: Record<Need, { variant: 'outline' | 'secondary'; className?: string | undefined }> = {
	yes: { variant: 'outline', className: 'border-brand/40 bg-brand-bg text-brand' },
	no: { variant: 'secondary' },
	delegating: { variant: 'outline', className: 'border-warn/40 bg-warn-bg text-warn' },
}

export function FieldList({ label, tag, fields, className }: Props) {
	return (
		<Card className={cn('gap-0 py-0', className)}>
			<dl aria-label={label} className="divide-y">
				{fields.map((row) => (
					<div key={row.field} className="px-4 py-3.5 sm:px-5">
						<dt className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
							<code className="font-mono text-[0.8125rem] font-medium break-all">{row.field}</code>
							<Badge variant={badge[row.need].variant} className={badge[row.need].className}>
								<span className="sr-only">{tag}: </span>
								{row.required}
							</Badge>
						</dt>
						<dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{row.note}</dd>
					</div>
				))}
			</dl>
		</Card>
	)
}

import { type ReactNode } from 'react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DirectionProvider } from '@/components/ui/direction'

interface Item {
	title: string
	html?: string | undefined
	slot?: 'first' | 'second' | undefined
}

interface Props {
	items: Item[]
	first?: ReactNode
	second?: ReactNode
	dir: 'ltr' | 'rtl'
}

export function AccordionList({ items, first, second, dir }: Props) {
	const slots = { first, second }
	return (
		<DirectionProvider direction={dir}>
			<Accordion hiddenUntilFound>
				{items.map((item, at) => (
					<AccordionItem key={at} value={String(at)}>
						<AccordionTrigger>
							<span dangerouslySetInnerHTML={{ __html: item.title }} />
						</AccordionTrigger>
						<AccordionContent className="text-[0.9375rem] leading-relaxed text-soft">
							{item.html !== undefined && <div dangerouslySetInnerHTML={{ __html: item.html }} />}
							{item.slot !== undefined && slots[item.slot]}
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</DirectionProvider>
	)
}

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataCell {
	text: string
	className?: string | undefined
}

interface DataRow {
	className?: string | undefined
	cells: DataCell[]
}

interface Props {
	label: string
	columns: readonly string[]
	rows: DataRow[]
	className?: string | undefined
	minWidth?: string | undefined
}

export function DataTable({ label, columns, rows, className, minWidth = 'min-w-[30rem]' }: Props) {
	return (
		<div
			role="region"
			aria-label={label}
			tabIndex={0}
			className={cn(
				'overflow-x-auto overscroll-x-contain rounded-xl bg-card ring-1 ring-foreground/10 focus-visible:outline-offset-0',
				className,
			)}
		>
			<table data-slot="table" className={cn('w-full caption-bottom text-sm leading-relaxed', minWidth)}>
				<TableHeader className="bg-muted">
					<TableRow className="hover:bg-transparent">
						{columns.map((column) => (
							<TableHead
								key={column}
								scope="col"
								className="h-auto px-4 py-3 text-xs font-medium tracking-wider text-muted-foreground uppercase"
							>
								{column}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, index) => (
						<TableRow key={index} className={row.className}>
							{row.cells.map((cell, at) => (
								<TableCell key={at} className={cn('px-4 py-3 align-top whitespace-normal', cell.className)}>
									{cell.text}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</table>
		</div>
	)
}

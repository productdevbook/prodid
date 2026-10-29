type Point = readonly [number, number]
type Tone = 'top' | 'left' | 'right' | 'deep'

interface Part {
	depth: number
	markup: string
}

const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)

export const SCENE_TONES = [
	'bg',
	'plate',
	'plate-side',
	'grid',
	'top',
	'left',
	'right',
	'deep',
	'line',
	'lit-top',
	'lit-left',
	'lit-right',
	'lit-deep',
] as const

export type ScenePalette = Record<(typeof SCENE_TONES)[number], string>

export const LIGHT: ScenePalette = {
	bg: '#f9f8f5',
	plate: '#f1f1ee',
	'plate-side': '#e2e2de',
	grid: '#e4e4e0',
	top: '#ffffff',
	left: '#e7e9ed',
	right: '#cfd3da',
	deep: '#98a0ad',
	line: '#b4bac4',
	'lit-top': '#dce8fb',
	'lit-left': '#86a9e6',
	'lit-right': '#4271c2',
	'lit-deep': '#1d3b73',
}

export const DARK: ScenePalette = {
	bg: '#14161b',
	plate: '#1a1d23',
	'plate-side': '#111318',
	grid: '#22262d',
	top: '#3b404b',
	left: '#2b2f38',
	right: '#21242b',
	deep: '#0e1014',
	line: '#4b515d',
	'lit-top': '#7d9fe0',
	'lit-left': '#4a71c0',
	'lit-right': '#2f5296',
	'lit-deep': '#132447',
}

function iso(x: number, y: number, z: number): Point {
	return [(x - y) * COS, (x + y) * SIN - z]
}

function n(value: number): string {
	return String(Math.round(value * 100) / 100)
}

function poly(points: Point[], tone: string): string {
	return `<path class="s-${tone}" d="M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z"/>`
}

const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

function track(points: Point[]): Point[] {
	for (const [x, y] of points) {
		bounds.minX = Math.min(bounds.minX, x)
		bounds.minY = Math.min(bounds.minY, y)
		bounds.maxX = Math.max(bounds.maxX, x)
		bounds.maxY = Math.max(bounds.maxY, y)
	}
	return points
}

function tone(name: Tone, lit: boolean): string {
	return lit ? `lit-${name}` : name
}

interface Box {
	x: number
	y: number
	z: number
	w: number
	d: number
	h: number
	lit?: boolean
}

function box({ x, y, z, w, d, h, lit = false }: Box): string {
	const top = track([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)])
	const right = track([iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)])
	const left = track([iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)])
	return poly(left, tone('left', lit)) + poly(right, tone('right', lit)) + poly(top, tone('top', lit))
}

function onLeft(b: Box, u: number, v: number, du: number, dv: number, cls: string): string {
	const y = b.y + b.d
	return poly(
		[iso(b.x + u, y, b.z + v), iso(b.x + u + du, y, b.z + v), iso(b.x + u + du, y, b.z + v + dv), iso(b.x + u, y, b.z + v + dv)],
		cls,
	)
}

function onRight(b: Box, u: number, v: number, du: number, dv: number, cls: string): string {
	const x = b.x + b.w
	return poly(
		[iso(x, b.y + u, b.z + v), iso(x, b.y + u + du, b.z + v), iso(x, b.y + u + du, b.z + v + dv), iso(x, b.y + u, b.z + v + dv)],
		cls,
	)
}

function onTop(b: Box, u: number, v: number, du: number, dv: number, cls: string): string {
	const z = b.z + b.h
	return poly(
		[iso(b.x + u, b.y + v, z), iso(b.x + u + du, b.y + v, z), iso(b.x + u + du, b.y + v + dv, z), iso(b.x + u, b.y + v + dv, z)],
		cls,
	)
}

function disc(cx: number, cy: number, z: number, r: number, h: number): string {
	const rx = r * Math.SQRT2 * COS
	const ry = r * Math.SQRT2 * SIN
	const [sx, sy] = iso(cx, cy, z)
	const top = sy - h
	track([
		[sx - rx, top - ry],
		[sx + rx, sy + ry],
	])
	const side = `<path class="s-cyl" d="M${n(sx - rx)} ${n(sy)}A${n(rx)} ${n(ry)} 0 0 0 ${n(sx + rx)} ${n(sy)}L${n(sx + rx)} ${n(top)}A${n(rx)} ${n(ry)} 0 0 1 ${n(sx - rx)} ${n(top)}Z"/>`
	const cap = `<ellipse class="s-top" cx="${n(sx)}" cy="${n(top)}" rx="${n(rx)}" ry="${n(ry)}"/>`
	const rim = `<ellipse class="s-rim" cx="${n(sx)}" cy="${n(top)}" rx="${n(rx * 0.62)}" ry="${n(ry * 0.62)}"/>`
	return side + cap + rim
}

function route(points: [number, number][]): { d: string; ends: string } {
	const screen = points.map(([x, y]) => iso(x, y, 0))
	const d = `M${screen.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}`
	const dot = ([x, y]: Point) => `<circle class="s-end" cx="${n(x)}" cy="${n(y)}" r="0.16"/>`
	return { d, ends: dot(screen[0]!) + dot(screen.at(-1)!) }
}

function token(d: string, begin: number, lit: boolean): string {
	const s = 0.42
	const cube = box({ x: -s / 2, y: -s / 2, z: 0, w: s, d: s, h: s, lit })
	const timing = `dur="9s" begin="${begin}s" repeatCount="indefinite"`
	return (
		`<g class="s-token" opacity="0">${cube}` +
		`<animateMotion path="${d}" ${timing} keyPoints="0;0;1;1" keyTimes="0;0.1;0.62;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.25 1;0 0 1 1"/>` +
		`<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.1;0.16;0.56;0.62;1" ${timing}/></g>`
	)
}

function still(at: [number, number], lit: boolean): string {
	const [x, y] = iso(at[0], at[1], 0)
	const s = 0.42
	return `<g class="s-still" transform="translate(${n(x)} ${n(y)})">${box({ x: -s / 2, y: -s / 2, z: 0, w: s, d: s, h: s, lit })}</g>`
}

export interface Scene {
	viewBox: string
	width: number
	height: number
	body: string
}

export function scene(): Scene {
	bounds.minX = bounds.minY = Infinity
	bounds.maxX = bounds.maxY = -Infinity
	const parts: Part[] = []
	const add = (b: { x: number; y: number; w: number; d: number }, markup: string) =>
		parts.push({ depth: b.x + b.w / 2 + b.y + b.d / 2, markup })

	const plate: Box = { x: -1, y: -1, z: -0.35, w: 23.8, d: 15.4, h: 0.35 }
	let ground = box(plate)
		.replace(/class="s-(left|right)"/g, 'class="s-plate-side"')
		.replace(/class="s-top"/, 'class="s-plate"')
	for (let x = 0.5; x < plate.x + plate.w; x += 2)
		ground += `<path class="s-grid" d="M${iso(x, plate.y, 0).map(n).join(' ')}L${iso(x, plate.y + plate.d, 0)
			.map(n)
			.join(' ')}"/>`
	for (let y = 0.5; y < plate.y + plate.d; y += 2)
		ground += `<path class="s-grid" d="M${iso(plate.x, y, 0).map(n).join(' ')}L${iso(plate.x + plate.w, y, 0)
			.map(n)
			.join(' ')}"/>`

	const tower: Box = { x: 1, y: 0.5, z: 0, w: 2.6, d: 2.6, h: 3.8 }
	let towerMarkup = box(tower)
	for (let row = 0; row < 5; row++) {
		for (let col = 0; col < 3; col++) {
			towerMarkup += onLeft(tower, 0.35 + col * 0.72, 0.55 + row * 0.62, 0.42, 0.34, 'deep')
			towerMarkup += onRight(tower, 0.35 + col * 0.72, 0.55 + row * 0.62, 0.42, 0.34, 'deep')
		}
	}
	const mast: Box = { x: 2.15, y: 1.65, z: tower.h, w: 0.3, d: 0.3, h: 1.1 }
	const flag: Box = { x: 2.45, y: 1.65, z: tower.h + 0.55, w: 0.9, d: 0.08, h: 0.55 }
	towerMarkup += box(mast) + box(flag)
	add(tower, towerMarkup)

	const host: Box = { x: 1, y: 5.6, z: 0, w: 2.6, d: 2.6, h: 2.3 }
	let hostMarkup = box(host)
	for (let row = 0; row < 3; row++) {
		hostMarkup += onLeft(host, 0.3, 0.45 + row * 0.62, 2.0, 0.16, 'deep')
		hostMarkup += onRight(host, 0.3, 0.45 + row * 0.62, 2.0, 0.16, 'deep')
		hostMarkup += onLeft(host, 2.05, 0.45 + row * 0.62 + 0.3, 0.2, 0.12, 'top')
	}
	for (const [u, v, h] of [
		[0.3, 0.3, 0.9],
		[1.4, 0.3, 0.6],
		[0.3, 1.45, 0.5],
		[1.4, 1.45, 1.05],
	] as const) {
		hostMarkup += box({ x: host.x + u, y: host.y + v, z: host.h, w: 0.85, d: 0.85, h })
	}
	add(host, hostMarkup)

	const shelf: Box = { x: 1, y: 10.6, z: 0, w: 2.6, d: 2.2, h: 2.25 }
	let shelfMarkup = ''
	for (let i = 0; i < 5; i++) {
		const slab: Box = { x: 1 + (i % 2) * 0.14, y: 10.6 - (i % 3) * 0.08, z: i * 0.45, w: 2.6, d: 2.2, h: 0.36 }
		shelfMarkup += box(slab) + onLeft(slab, 0.25, 0.12, 0.9, 0.1, 'deep')
	}
	add(shelf, shelfMarkup)

	const index: Box = { x: 8, y: 4, z: 0, w: 6.4, d: 6.4, h: 0.7 }
	let indexMarkup = box(index)
	for (let i = 0; i < 4; i++) {
		indexMarkup += onLeft(index, 0.4 + i * 1.5, 0.22, 0.9, 0.24, 'deep')
		indexMarkup += onRight(index, 0.4 + i * 1.5, 0.22, 0.9, 0.24, 'deep')
	}
	for (let u = 0; u < 4; u++) {
		for (let v = 0; v < 4; v++) {
			if ((u === 1 || u === 2) && (v === 1 || v === 2)) continue
			indexMarkup += onTop(index, 0.35 + u * 1.5, 0.35 + v * 1.5, 1.2, 1.2, 'grid')
		}
	}
	for (let i = 0; i < 3; i++) indexMarkup += disc(11.2, 7.2, index.h + i * 0.72, 1.55, 0.58)
	add(index, indexMarkup)

	const product: Box = { x: 18.4, y: 3.6, z: 0, w: 3.2, d: 2.6, h: 2.5, lit: true }
	let productMarkup = box(product)
	const bars = [0.1, 0.05, 0.14, 0.05, 0.05, 0.1, 0.18, 0.05, 0.1, 0.05, 0.14, 0.05, 0.1, 0.05, 0.18, 0.05, 0.1]
	let u = 0.55
	bars.forEach((width, i) => {
		if (i % 2 === 0) productMarkup += onLeft(product, u, 0.5, width, 1.2, 'lit-deep')
		u += width + 0.06
	})
	const qr = ['1110111', '1000101', '1011101', '0001000', '1101011', '1000110', '1110101']
	qr.forEach((line, row) =>
		[...line].forEach((cell, col) => {
			if (cell === '1') productMarkup += onTop(product, 0.85 + col * 0.22, 0.55 + row * 0.22, 0.2, 0.2, 'lit-deep')
		}),
	)
	productMarkup += onRight(product, 0.35, 1.75, 1.9, 0.12, 'lit-deep') + onRight(product, 0.35, 1.45, 1.2, 0.12, 'lit-deep')
	add(product, productMarkup)

	const crates: Box[] = [
		{ x: 15.2, y: 11.9, z: 0, w: 1.5, d: 1.5, h: 1.2 },
		{ x: 17.0, y: 11.9, z: 0, w: 1.5, d: 1.5, h: 1.2 },
		{ x: 16.1, y: 11.95, z: 1.2, w: 1.5, d: 1.5, h: 1.2 },
	]
	add({ x: 15.2, y: 11.9, w: 3.3, d: 1.5 }, crates.map((crate) => box(crate) + onLeft(crate, 0.25, 0.5, 1.0, 0.18, 'deep')).join(''))

	parts.sort((a, b) => a.depth - b.depth)

	const routes = [
		route([
			[3.6, 1.8],
			[6, 1.8],
			[6, 5.4],
			[8, 5.4],
		]),
		route([
			[3.6, 6.9],
			[8, 6.9],
		]),
		route([
			[3.6, 11.7],
			[6, 11.7],
			[6, 8.6],
			[8, 8.6],
		]),
		route([
			[14.4, 4.9],
			[18.4, 4.9],
		]),
		route([
			[11.2, 10.4],
			[11.2, 12.65],
			[15.2, 12.65],
		]),
	]
	const lines = routes.map((r) => `<path class="s-ln" d="${r.d}"/>${r.ends}`).join('')
	const tokens =
		token(routes[0]!.d, 0, false) +
		token(routes[1]!.d, -3, false) +
		token(routes[2]!.d, -6, false) +
		token(routes[3]!.d, -1.5, true) +
		token(routes[4]!.d, -4.5, false)
	const stills = still([5.6, 6.9], false) + still([16.4, 4.9], true) + still([13.2, 12.65], false)

	const pad = 0.6
	const width = bounds.maxX - bounds.minX + pad * 2
	const height = bounds.maxY - bounds.minY + pad * 2
	return {
		viewBox: `${n(bounds.minX - pad)} ${n(bounds.minY - pad)} ${n(width)} ${n(height)}`,
		width,
		height,
		body: `<g class="s-scene">${ground}${lines}${tokens}${stills}${parts.map((part) => part.markup).join('')}</g>`,
	}
}

export const SCENE_STYLE = `
.s-scene path,.s-scene ellipse{stroke-linejoin:round}
.s-plate{fill:var(--scene-plate)}.s-plate-side{fill:var(--scene-plate-side)}
.s-grid{fill:var(--scene-grid);stroke:var(--scene-grid);stroke-width:.03}
.s-top{fill:var(--scene-top)}.s-left{fill:var(--scene-left)}.s-right{fill:var(--scene-right)}.s-deep{fill:var(--scene-deep)}
.s-lit-top{fill:var(--scene-lit-top)}.s-lit-left{fill:var(--scene-lit-left)}.s-lit-right{fill:var(--scene-lit-right)}.s-lit-deep{fill:var(--scene-lit-deep)}
.s-cyl{fill:var(--scene-right)}.s-rim{fill:none;stroke:var(--scene-left);stroke-width:.05}
.s-ln{fill:none;stroke:var(--scene-line);stroke-width:.07;stroke-linecap:round}
.s-end{fill:var(--scene-line)}
.s-still{display:none}
@media (prefers-reduced-motion:reduce){.s-token{display:none}.s-still{display:inline}}
`

export function paletteVars(palette: ScenePalette): string {
	return SCENE_TONES.map((name) => `--scene-${name}:${palette[name]}`).join(';')
}

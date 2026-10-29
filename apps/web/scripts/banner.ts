import { mkdirSync, writeFileSync } from 'node:fs'

import { DARK, LIGHT, paletteVars, scene, SCENE_STYLE, type ScenePalette } from '../src/lib/scene.ts'

const WIDTH = 1280
const HEIGHT = 640
const out = new URL('../../../docs/assets/', import.meta.url)

const text = {
	light: { ink: '#1d2230', soft: '#5f6675', accent: '#2f5fae' },
	dark: { ink: '#eceef2', soft: '#9aa0ab', accent: '#86a9e6' },
}

function banner(palette: ScenePalette, ink: { ink: string; soft: string; accent: string }): string {
	const drawing = scene()
	const [minX, minY, width, height] = drawing.viewBox.split(' ').map(Number) as [number, number, number, number]
	const area = { x: 300, y: 40, w: 960, h: 580 }
	const scale = Math.min(area.w / width, area.h / height)
	const tx = area.x + (area.w - width * scale) / 2 - minX * scale
	const ty = area.y + (area.h - height * scale) / 2 - minY * scale
	const font = `ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`
	const mono = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="prodid: publishers state product facts on their own domains, one open index joins every code to a permanent identifier, and anyone can download the whole index.">
<style>svg{${paletteVars(palette)}}${SCENE_STYLE}</style>
<rect width="${WIDTH}" height="${HEIGHT}" rx="24" fill="${palette.bg}"/>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(3)})">${drawing.body}</g>
<g font-family="${font}">
<g transform="translate(64 92)" fill="${ink.ink}">
<rect x="0" y="-30" width="4.9" height="37.5" rx="2.4"/><rect x="10.5" y="-24.4" width="2.8" height="26.2" rx="1.4"/><rect x="18.9" y="-30" width="6" height="37.5" rx="3"/><circle cx="40.1" cy="-11.3" r="8.6"/>
<text x="60" y="6" font-family="${mono}" font-size="40" font-weight="600" letter-spacing="-1">prodid</text>
</g>
<text x="64" y="136" font-size="21" fill="${ink.soft}">An open identity and data layer</text>
<text x="64" y="164" font-size="21" fill="${ink.soft}">for every physical product.</text>
<text x="${WIDTH - 64}" y="${HEIGHT - 88}" text-anchor="end" font-size="17" fill="${ink.soft}">Publishers state facts on their own domains.</text>
<text x="${WIDTH - 64}" y="${HEIGHT - 62}" text-anchor="end" font-size="17" fill="${ink.soft}">Every code resolves to one permanent <tspan fill="${ink.accent}" font-family="${mono}">opid</tspan>.</text>
<text x="${WIDTH - 64}" y="${HEIGHT - 36}" text-anchor="end" font-size="17" fill="${ink.soft}">The whole index is open to download.</text>
</g>
</svg>
`
}

mkdirSync(out, { recursive: true })
writeFileSync(new URL('banner-light.svg', out), banner(LIGHT, text.light))
writeFileSync(new URL('banner-dark.svg', out), banner(DARK, text.dark))

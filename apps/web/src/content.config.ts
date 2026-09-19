import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'

const spec = defineCollection({
	loader: glob({ base: '../../spec', pattern: 'README.md' }),
})

export const collections = { spec }

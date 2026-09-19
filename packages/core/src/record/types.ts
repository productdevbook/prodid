export interface RecordIdentifier {
	scheme: string
	value: string
}

export type PropertyValue = string | number | boolean | string[] | { value: number; unit: string }

export interface MediaEntry {
	url: string
	license: string
	kind?: 'image' | 'document'
}

export interface ItemRecord {
	$type: 'org.prodid.item'
	key: string
	brand: string
	name: string
	lang?: string
	group?: string
	variant?: Record<string, string>
	identifiers: RecordIdentifier[]
	category?: string
	markets?: string[]
	properties?: Record<string, PropertyValue>
	media?: MediaEntry[]
}

export interface FeedPublisher {
	name: string
	contact?: string
}

export interface FeedRecord {
	$type: 'org.prodid.feed'
	version: 0
	domain?: string
	publisher: FeedPublisher
	license: string
	feeds: string[]
}

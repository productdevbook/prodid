import entityItem from '../../../../spec/examples/entity.item.json?raw'
import itemJacket from '../../../../spec/examples/item.jacket.json?raw'
import items from '../../../../spec/examples/items.ndjson?raw'
import feedDelegated from '../../../../spec/examples/prodid.delegated.json?raw'
import feed from '../../../../spec/examples/prodid.json?raw'
import source from '../../../../spec/examples/source.json?raw'

/** Read from `spec/examples/` at build time: a missing file fails the build instead of the page going stale. */
export const examples = {
	feed: feed.trimEnd(),
	feedDelegated: feedDelegated.trimEnd(),
	items: items.trimEnd(),
	itemJacket: itemJacket.trimEnd(),
	entityItem: entityItem.trimEnd(),
	source: source.trimEnd(),
}

export const SPEC_STATUS = 'Spec v0 draft · reference implementation live'

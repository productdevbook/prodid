export { type AddressClass, classifyAddress, isPublicAddress, parseIpv4, parseIpv6 } from './address'
export { canonicalHash, canonicalize, type JsonValue } from './canonical'
export {
	type Claim,
	deriveClaims,
	deriveIdentifiers,
	deriveRecord,
	type DerivedRecord,
	groupingKeys,
	type GroupingKeys,
	type SourceContext,
} from './claims'
export {
	acceptDiscovery,
	checkFetchable,
	delegationHost,
	type DiscoveryDecision,
	type DiscoveryPlan,
	type DiscoveryRejection,
	type DiscoveryResponse,
	type DiscoveryVia,
	type FetchCheck,
	type FetchRejection,
	isDnsName,
	isFeedAllowed,
	isRedirectAllowed,
	joinTxtRecord,
	normalizeDomain,
	parseDiscoveryTxt,
	type PlanRejection,
	planDiscovery,
	type PlanResult,
	TXT_PREFIX,
	TXT_VERSION,
	txtName,
	type TxtDelegation,
	type TxtRecord,
	type TxtRejection,
	type TxtResult,
	WELL_KNOWN_PATH,
	wellKnownUrl,
} from './discovery'
export { gtinCheckDigit, type GtinProblem, type GtinResult, isGtin, parseGtin } from './gtin'
export { type IdentifierScope, normalizeBrand, normalizeIdentifier, type NormalizedIdentifier } from './identifier'
export { DEFAULT_MAX_LINE_BYTES, type NdjsonEntry, type NdjsonOptions, readNdjson } from './ndjson'
export { encodeOpid, isOpid, mintOpid, OPID_PATTERN } from './opid'
export {
	type FeedPublisher,
	type FeedRecord,
	type ItemRecord,
	type MediaEntry,
	type PropertyValue,
	type RecordIdentifier,
	validateFeed,
	validateItem,
	type ValidationError,
	type ValidationResult,
} from './record/index'

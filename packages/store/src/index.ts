export { createClient, DEFAULT_ATTEMPTS, isRetryable, type Sql, type TransactionSql, withRetry } from './client'
export { type Disagreement, type IngestResult, ingestRecord, ingestRecords, type RecordOutcome } from './ingest'
export { mergeEntities, type MergeInput, type MergeResult, revertMerge } from './merge'
export { type PreparedClaim, type PreparedRecord, prepareRecord, type PrepareResult } from './prepare'
export { type EntityLookup, type GtinLookup, readEntity, readEntityByGtin, readSourceStatus, type ReadOptions } from './read'
export {
	classifyOutcome,
	countVerifiedSourcesAtHost,
	type CrawlOutcome,
	DAY_MS,
	type FeedRow,
	type FeedStateInput,
	type FinishCrawlInput,
	findOrCreateSource,
	findSourceById,
	findSourceByName,
	finishCrawl,
	type IdentityUpgradeInput,
	LAPSE_AFTER_FAILING_MS,
	readFeedStates,
	recordVerification,
	saveFeedState,
	setSourceLicense,
	SKIPPING_GRACE_MS,
	type SourceRow,
	sourcesDueForCrawl,
	startCrawl,
	upgradeSourceIdentity,
	type VerificationInput,
	withinSkipGrace,
	WITHDRAW_AFTER_LAPSE_MS,
} from './source'
export { lapseSweep, type SweepResult } from './sweep'
export { withdrawAbsentRecords, type WithdrawalResult, withdrawSourceClaims } from './withdraw'

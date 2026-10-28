export { type CandidateSide, DEFAULT_CANDIDATE_LIMIT, findMergeCandidates, type MergeCandidate } from './candidates'
export { createClient, DEFAULT_ATTEMPTS, isRetryable, type Sql, type TransactionSql, withRetry } from './client'
export {
	DUMP_FILES,
	DUMP_PAGE,
	type DumpFile,
	type DumpSnapshot,
	type EntityLine,
	type FamilyKey,
	type GroupingLine,
	type MergeLine,
	readSnapshot,
	type RecordLine,
	type VariantKey,
} from './dump'
export {
	type Disagreement,
	type IngestResult,
	ingestRecord,
	ingestRecords,
	MEDIA_RECHECK_MS,
	type MediaWanted,
	type RecordOutcome,
} from './ingest'
export { DumpError, type DumpLines, loadDump, LOADED_MERGE_REASON, type LoadOptions, type LoadResult } from './load'
export { attachMediaClaim, blockMedia, findMedia, type MediaClaimInput, type MediaRow, recordMedia, touchMediaClaim } from './media'
export { mergeEntities, type MergeInput, type MergeResult, revertMerge } from './merge'
export { type PreparedClaim, type PreparedRecord, prepareRecord, type PrepareResult } from './prepare'
export { type EntityLookup, type GtinLookup, readEntity, readEntityByGtin, readSourceStatus, type ReadOptions } from './read'
export {
	accumulateCrawl,
	classifyOutcome,
	claimLapseNotice,
	type ClaimedNotice,
	countMediaFailure,
	countVerifiedSourcesAtHost,
	type CrawlOutcome,
	type CrawlProgress,
	DAY_MS,
	type FeedRow,
	type FeedStateInput,
	type FinishCrawlInput,
	ensureFeeds,
	finalizeStaleCrawls,
	findOrCreateSource,
	findSourceById,
	findSourceByName,
	hasLiveRecords,
	isCrawlOpen,
	finishCrawl,
	type IdentityUpgradeInput,
	LAPSE_AFTER_FAILING_MS,
	type LapseNotice,
	QUEUE_LEASE_MS,
	readFeedStates,
	retireAbsentFeeds,
	recordVerification,
	releaseLapseNotice,
	saveFeedState,
	setSourceLicense,
	SKIPPING_GRACE_MS,
	type SourceRow,
	claimDueSources,
	startCrawl,
	upgradeSourceIdentity,
	type VerificationInput,
	withinSkipGrace,
	WITHDRAW_AFTER_LAPSE_MS,
} from './source'
export { lapseSweep, type SweepResult } from './sweep'
export { withdrawAbsentRecords, type WithdrawalResult, withdrawSource } from './withdraw'

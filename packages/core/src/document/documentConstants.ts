/**
 * When a document has no more subscribers, its state is cleaned up and removed
 * from the store. A delay used to prevent re-creating resources when the last
 * subscriber is removed quickly before another one is added. This is helpful
 * when used in a frontend where components may suspend or transition to
 * different views quickly.
 */
export const DOCUMENT_STATE_CLEAR_DELAY = 1000
export const INITIAL_OUTGOING_THROTTLE_TIME = 1000
export const API_VERSION = 'v2025-05-06'

/**
 * How long a submitted transaction's revision is kept around waiting to be
 * verified by its listener echo. After this, the transaction is no longer
 * treated as in flight and a document held onto only for that verification can
 * be evicted. Sized to match the listener's own chaining deadline, after which
 * an echo that has not arrived is not going to.
 */
export const UNVERIFIED_REVISION_RETENTION_TIME = 30_000

/**
 * Base delay (ms) before retrying a document listener after an `OutOfSyncError`.
 * Backoff doubles on each successive retry, capped at {@link OUT_OF_SYNC_RETRY_MAX_DELAY}.
 */
export const OUT_OF_SYNC_RETRY_BASE_DELAY = 500
export const OUT_OF_SYNC_RETRY_MAX_DELAY = 10_000

/**
 * Base delay (ms) before retrying the dataset ACL fetch after a transient
 * failure (a network error or 5xx response). Backoff doubles on each
 * successive retry, capped at {@link ACL_RETRY_MAX_DELAY}.
 */
export const ACL_RETRY_BASE_DELAY = 500
export const ACL_RETRY_MAX_DELAY = 10_000

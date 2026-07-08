/**
 * When a query has no more subscribers, its state is cleaned up and removed
 * from the store. A delay used to prevent re-creating resources when the last
 * subscriber is removed quickly before another one is added. This is helpful
 * when used in a frontend where components may suspend or transition to
 * different views quickly.
 */
export const QUERY_STATE_CLEAR_DELAY = 1000
export const QUERY_STORE_API_VERSION = 'v2025-05-06'
export const QUERY_STORE_DEFAULT_PERSPECTIVE = 'drafts'

/**
 * Delay before re-establishing the live events connection after a
 * server-initiated error (e.g. ChannelError, MessageError). Live errors are
 * retried rather than surfaced because an errored live connection would
 * otherwise poison the whole store. Plain connection drops never reach this —
 * they are reconnected inside `@sanity/client`.
 */
export const LIVE_EVENTS_RETRY_DELAY = 1000

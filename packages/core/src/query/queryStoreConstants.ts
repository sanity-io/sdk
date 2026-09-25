import {UPSTREAM_CLOSE_DELAY_MS} from '../store/createStoreInstance'

/**
 * When a query has no more subscribers, its state is cleaned up and removed
 * from the store. A delay used to prevent re-creating resources when the last
 * subscriber is removed quickly before another one is added. This is helpful
 * when used in a frontend where components may suspend or transition to
 * different views quickly.
 *
 * Must not exceed the live connection's close delay: nothing refetches when the
 * connection reopens, so a result kept past the close would miss live events.
 */
export const QUERY_STATE_CLEAR_DELAY = UPSTREAM_CLOSE_DELAY_MS
export const QUERY_STORE_API_VERSION = 'v2025-05-06'
export const QUERY_STORE_DEFAULT_PERSPECTIVE = 'drafts'

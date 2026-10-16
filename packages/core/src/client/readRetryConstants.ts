/**
 * Base delay (ms) before retrying a read after a transient failure (a network
 * error, a 5xx, 408 or 429 response). Backoff doubles on each successive
 * retry, capped at {@link READ_RETRY_MAX_DELAY}. After
 * {@link READ_RETRY_COUNT} retries the failure surfaces, and retries continue.
 */
export const READ_RETRY_BASE_DELAY = 500
export const READ_RETRY_MAX_DELAY = 10_000
export const READ_RETRY_COUNT = 5

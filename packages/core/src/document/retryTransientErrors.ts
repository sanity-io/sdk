import {ClientError, ServerError} from '@sanity/client'
import {type MonoTypeOperatorFunction, retry, throwError, timer} from 'rxjs'

import {
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from './documentConstants'
import {OutOfSyncError} from './listen'

/**
 * Retries a read that failed for a reason expected to clear on its own (the
 * listener falling out of sync, a server error, a timeout, or rate limiting),
 * backing off exponentially. Any other error, or one that outlasts the retries,
 * is passed on for the caller to surface.
 */
export function retryTransientErrors<T>(): MonoTypeOperatorFunction<T> {
  return retry({
    count: OUT_OF_SYNC_RETRY_COUNT,
    resetOnSuccess: true,
    delay: (error, retryCount) => {
      const isTransient =
        error instanceof OutOfSyncError ||
        error instanceof ServerError ||
        (error instanceof ClientError && (error.statusCode === 408 || error.statusCode === 429))
      if (!isTransient) return throwError(() => error)
      const backoff = Math.min(
        OUT_OF_SYNC_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
        OUT_OF_SYNC_RETRY_MAX_DELAY,
      )
      return timer(backoff)
    },
  })
}

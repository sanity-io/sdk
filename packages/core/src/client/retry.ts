import {ConnectionFailedError, CorsOriginError, type SanityClient} from '@sanity/client'
import {
  defer,
  type MonoTypeOperatorFunction,
  type Observable,
  race,
  retry,
  skip,
  take,
  tap,
  timer,
} from 'rxjs'

import {
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from '../document/documentConstants'

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof ConnectionFailedError) return error.status
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }
  return undefined
}

// unknown failures (network errors, timeouts) count as transient, as in `classifySubmissionError`
function isTransient(error: unknown): boolean {
  if (error instanceof CorsOriginError) return false
  const statusCode = getStatusCode(error)
  return statusCode === undefined || statusCode >= 500 || statusCode === 408 || statusCode === 429
}

/**
 * Retries transient failures after a backoff and any other failure once `clients` emits a new
 * client. `setError` receives `undefined` once the read recovers.
 *
 * @internal
 */
export function retryRead<T>(
  clients: Observable<SanityClient>,
  setError: (error: unknown) => void,
): MonoTypeOperatorFunction<T> {
  return (source) =>
    defer(() => {
      let failing = false

      return source.pipe(
        tap(() => {
          if (!failing) return
          failing = false
          setError(undefined)
        }),
        retry({
          resetOnSuccess: true,
          delay: (error: unknown, retryCount) => {
            const transient = isTransient(error)

            if (!transient || retryCount > OUT_OF_SYNC_RETRY_COUNT) {
              failing = true
              setError(error)
            }

            // skips the current client, which `clients` replays on subscribe
            const nextClient = clients.pipe(skip(1), take(1))

            if (!transient) return nextClient

            const backoff = Math.min(
              OUT_OF_SYNC_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
              OUT_OF_SYNC_RETRY_MAX_DELAY,
            )

            return race(timer(backoff), nextClient)
          },
        }),
      )
    })
}

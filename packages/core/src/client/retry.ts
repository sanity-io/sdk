import {
  ClientError,
  ConnectionFailedError,
  CorsOriginError,
  type SanityClient,
} from '@sanity/client'
import {
  defer,
  EMPTY,
  type MonoTypeOperatorFunction,
  type Observable,
  race,
  retry,
  skip,
  take,
  tap,
  timer,
} from 'rxjs'

import {getProjectAccessErrorDetails} from '../auth/projectAccessError'
import {getClientErrorApiBody} from '../auth/utils'
import {
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from '../document/documentConstants'
import {DocumentInaccessibleError} from '../document/listen'

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof ClientError) return error.statusCode
  return error instanceof ConnectionFailedError ? error.status : undefined
}

function isMissingAccess(error: unknown): boolean {
  if (getProjectAccessErrorDetails(error)) return true
  return error instanceof ClientError && getClientErrorApiBody(error)?.code === 'missing_grant'
}

function classify(error: unknown): 'session' | 'access' | 'transient' | 'terminal' {
  if (error instanceof DocumentInaccessibleError) return 'session'
  if (error instanceof CorsOriginError) return 'terminal'

  const statusCode = getStatusCode(error)

  if (statusCode === 401) return isMissingAccess(error) ? 'access' : 'session'

  return statusCode === undefined || statusCode >= 500 || statusCode === 408 || statusCode === 429
    ? 'transient'
    : 'terminal'
}

/**
 * Retries a failed read:
 *
 * - a 401 or a {@link DocumentInaccessibleError} retries once `clients` emits a
 *   new client, which happens when the token changes
 * - a 401 for a missing project membership or grant also retries after a
 *   backoff for the first {@link OUT_OF_SYNC_RETRY_COUNT} retries
 * - a network error, 408, 429 or 5xx retries after a backoff, and reaches
 *   `setError` after `count` retries
 * - a CORS error or any other 4xx reaches `setError` and isn't retried
 *
 * Each failure streak reaches `setError` once, and `setError` receives
 * `undefined` once the read recovers.
 *
 * @internal
 */
export function retryRead<T>(
  clients: Observable<SanityClient>,
  setError: (error: unknown) => void,
  {baseDelay, maxDelay, count = Infinity}: {baseDelay: number; maxDelay: number; count?: number} = {
    baseDelay: OUT_OF_SYNC_RETRY_BASE_DELAY,
    maxDelay: OUT_OF_SYNC_RETRY_MAX_DELAY,
    count: OUT_OF_SYNC_RETRY_COUNT,
  },
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
            const failure = classify(error)
            // skips the current client, which `clients` replays on subscribe
            const nextClient = clients.pipe(skip(1), take(1))

            if (failure === 'terminal') {
              setError(error)
              return EMPTY
            }

            if (!failing && (failure !== 'transient' || retryCount > count)) {
              failing = true
              setError(error)
            }

            if (
              failure === 'session' ||
              (failure === 'access' && retryCount > OUT_OF_SYNC_RETRY_COUNT)
            ) {
              return nextClient
            }

            return race(timer(Math.min(baseDelay * 2 ** (retryCount - 1), maxDelay)), nextClient)
          },
        }),
      )
    })
}

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

import {getClientErrorApiBody, getClientErrorApiType} from '../auth/utils'
import {
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from '../document/documentConstants'
import {DocumentInaccessibleError} from '../document/documentInaccessibleError'

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof ClientError) return error.statusCode

  return error instanceof ConnectionFailedError ? error.status : undefined
}

/**
 * Whether a failed request can succeed when sent again: a 408, 429 or 5xx, or any
 * error without an HTTP status, such as a network error. CORS errors are not transient.
 * @internal
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof CorsOriginError) return false

  const statusCode = getStatusCode(error)

  return statusCode === undefined || statusCode >= 500 || statusCode === 408 || statusCode === 429
}

function isMissingAccess(error: unknown): boolean {
  if (!(error instanceof ClientError)) return false

  return (
    getClientErrorApiType(error) === 'projectUserNotFoundError' ||
    getClientErrorApiBody(error)?.code === 'missing_grant'
  )
}

function classify(error: unknown): 'session' | 'access' | 'transient' | 'terminal' {
  if (error instanceof DocumentInaccessibleError) return 'session'
  if (getStatusCode(error) === 401) return isMissingAccess(error) ? 'access' : 'session'

  return isTransientError(error) ? 'transient' : 'terminal'
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
 * `setError` receives a failure once, and again only when the kind of failure
 * changes. It receives `undefined` once the read recovers, when it moves on
 * to a transient failure that isn't reported yet, or once `clients` emits a
 * new client, so a boundary that resets on the token doesn't catch it again.
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
      let shown: ReturnType<typeof classify> | undefined
      const clearError = () => {
        if (!shown) return
        shown = undefined
        setError(undefined)
      }

      return source.pipe(
        tap(clearError),
        retry({
          resetOnSuccess: true,
          delay: (error: unknown, retryCount) => {
            const failure = classify(error)
            // skips the current client, which `clients` replays on subscribe
            const nextClient = clients.pipe(skip(1), take(1), tap(clearError))

            if (failure === 'terminal') {
              setError(error)
              return EMPTY
            }

            const visible = failure !== 'transient' || retryCount > count ? failure : undefined

            if (visible !== shown) {
              shown = visible
              setError(visible ? error : undefined)
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

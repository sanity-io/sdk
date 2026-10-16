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

import {READ_RETRY_BASE_DELAY, READ_RETRY_COUNT, READ_RETRY_MAX_DELAY} from './readRetryConstants'

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof ConnectionFailedError) return error.status
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }
  return undefined
}

// unknown failures (network errors, timeouts, dropped listeners) count as
// transient, like in `classifySubmissionError`
function isTransient(error: unknown): boolean {
  if (error instanceof CorsOriginError) return false
  const statusCode = getStatusCode(error)
  return statusCode === undefined || statusCode >= 500 || statusCode === 408 || statusCode === 429
}

/**
 * Whether requests made with `client` are authenticated, by token or by cookie.
 *
 * @internal
 */
export function hasCredentials(client: SanityClient): boolean {
  const {token, withCredentials} = client.config()
  return Boolean(token || withCredentials)
}

/**
 * Retries a failed read until it succeeds:
 *
 * - transient failures (network errors, 408, 429, 5xx) retry with backoff
 * - any other failure, such as a 401 or 403, retries once the credentials
 *   change, because the same request with the same token fails the same way
 *
 * Both retry right away when `clients` emits a new client, which the client
 * store does whenever the token changes. `clients` must emit its current
 * client on subscribe, like `getClientState(...).observable`.
 *
 * `setError` receives a failure as soon as it needs a new token, or once
 * transient retries exceed {@link READ_RETRY_COUNT}, and `undefined` when the
 * read recovers.
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

            if (!transient || retryCount > READ_RETRY_COUNT) {
              failing = true
              setError(error)
            }

            const nextClient = clients.pipe(skip(1), take(1))

            if (!transient) return nextClient

            const backoff = Math.min(
              READ_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
              READ_RETRY_MAX_DELAY,
            )

            return race(timer(backoff), nextClient)
          },
        }),
      )
    })
}

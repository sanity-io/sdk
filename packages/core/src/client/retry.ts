import {
  ChannelError,
  ClientError,
  ConnectionFailedError,
  DisconnectError,
  isTimeoutError,
  MessageError,
  MessageParseError,
  ServerError,
} from '@sanity/client'
import {
  defer,
  EMPTY,
  filter,
  type MonoTypeOperatorFunction,
  type Observable,
  race,
  retry,
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
import {OutOfSyncError} from '../document/outOfSyncError'
import {isNetworkFailure} from '../errorReporting/isNetworkFailure'
import {type StateSource} from '../store/createStateSourceAction'

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof ClientError || error instanceof ServerError) return error.statusCode

  return error instanceof ConnectionFailedError ? error.status : undefined
}

/**
 * Whether a failed request can succeed when sent again: the network failed, the request timed
 * out, a listener dropped or the server ended it with an error, or the API answered with a 408,
 * 429 or 5xx. Any other error, like a CORS error or a response the caller rejected, fails the
 * same way however often it's sent.
 * @internal
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof ConnectionFailedError && error.status === undefined) return true
  // `@sanity/client` doesn't reconnect a listener after these, so the read has to
  if (
    error instanceof ChannelError ||
    error instanceof DisconnectError ||
    error instanceof MessageError ||
    error instanceof MessageParseError
  ) {
    return true
  }
  if (isNetworkFailure(error) || isTimeoutError(error)) return true

  const statusCode = getStatusCode(error)

  return statusCode !== undefined && (statusCode >= 500 || statusCode === 408 || statusCode === 429)
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
  if (error instanceof OutOfSyncError || isTransientError(error)) return 'transient'

  const statusCode = getStatusCode(error)
  if (statusCode === 401) return isMissingAccess(error) ? 'access' : 'session'
  // Preferences wraps request errors to give them its own codes; the request error inside decides
  if (statusCode === undefined && error instanceof Error && error.cause !== undefined) {
    return classify(error.cause)
  }

  return 'terminal'
}

type CredentialSource = Pick<StateSource<unknown>, 'getCurrent' | 'observable'>

/**
 * Retries `source` after `delay` emits. `delay` also gets an observable that
 * emits once `credential` differs from the one the failed attempt went out
 * with, including a change made while the attempt was in flight.
 *
 * @internal
 */
export function retryWithCredential<T>(
  source: Observable<T>,
  credential: CredentialSource,
  delay: (
    error: unknown,
    retryCount: number,
    credentialChanged: Observable<unknown>,
  ) => Observable<unknown>,
): Observable<T> {
  return defer(() => {
    let attemptCredential: unknown

    return defer(() => {
      attemptCredential = credential.getCurrent()
      return source
    }).pipe(
      retry({
        resetOnSuccess: true,
        delay: (error: unknown, retryCount) =>
          delay(
            error,
            retryCount,
            credential.observable.pipe(
              filter((current) => current !== attemptCredential),
              take(1),
            ),
          ),
      }),
    )
  })
}

/**
 * Hands each error to `onError`, then retries once `credential` changes.
 *
 * @internal
 */
export function retryOnCredentialChange<T>(
  credential: CredentialSource,
  onError: (error: unknown) => void = () => {},
): MonoTypeOperatorFunction<T> {
  return (source) =>
    retryWithCredential(source, credential, (error, _, credentialChanged) => {
      onError(error)
      return credentialChanged
    })
}

/**
 * Retries a failed read:
 *
 * - a 401 or a {@link DocumentInaccessibleError} retries once `credential`
 *   differs from the one the failed attempt went out with
 * - a 401 for a missing project membership or grant also retries after a
 *   backoff for the first {@link OUT_OF_SYNC_RETRY_COUNT} retries
 * - a failure {@link isTransientError} expects to pass, or an `OutOfSyncError`,
 *   retries after a backoff, and reaches `setError` after `count` retries
 * - any other error, like a CORS error, another 4xx, or one the read raised
 *   itself, reaches `setError` and isn't retried
 *
 * An error wrapping another, like a `PreferenceError` for a failed request, is
 * retried the way the error inside it would be.
 *
 * `setError` receives a failure once, and again only when the kind of failure
 * changes. It receives `undefined` once the read recovers, or when it moves on
 * to a transient failure that isn't reported yet.
 *
 * @internal
 */
export function retryRead<T>(
  credential: CredentialSource,
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

      const recovering = source.pipe(
        tap(() => {
          if (!shown) return
          shown = undefined
          setError(undefined)
        }),
      )

      return retryWithCredential(recovering, credential, (error, retryCount, credentialChanged) => {
        const failure = classify(error)

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
          return credentialChanged
        }

        return race(timer(Math.min(baseDelay * 2 ** (retryCount - 1), maxDelay)), credentialChanged)
      })
    })
}

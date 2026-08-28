import {type CurrentUser} from '@sanity/types'
import {EMPTY, fromEvent, Observable} from 'rxjs'

import {AUTH_CODE_PARAM, DEFAULT_BASE} from './authConstants'
import {AuthStateType} from './authStateType'
import {type LoggedInAuthState} from './authStore'

/**
 * Creates a properly initialized {@link LoggedInAuthState}.
 *
 * For stamped tokens (containing `"-st"`), `lastTokenRefresh` is set to
 * `Date.now()` so that the visibility-change handler in
 * {@link refreshStampedToken} does not trigger an unnecessary refresh the
 * first time the tab becomes visible.
 *
 * @param token - The auth token.
 * @param currentUser - The current user, or `null` if not yet fetched.
 * @param existingLastTokenRefresh - An existing timestamp to preserve
 *   (e.g. when updating a token while keeping the previous refresh time).
 * @internal
 */
export function createLoggedInAuthState(
  token: string,
  currentUser: CurrentUser | null,
  existingLastTokenRefresh?: number,
): LoggedInAuthState {
  const isStampedToken = token.includes('-st')
  const lastTokenRefresh = existingLastTokenRefresh ?? (isStampedToken ? Date.now() : undefined)

  return {
    type: AuthStateType.LOGGED_IN,
    token,
    currentUser,
    ...(lastTokenRefresh !== undefined && {lastTokenRefresh}),
  }
}

export function getAuthCode(callbackUrl: string | undefined, locationHref: string): string | null {
  const loc = new URL(locationHref, DEFAULT_BASE)
  const callbackLocation = callbackUrl ? new URL(callbackUrl, DEFAULT_BASE) : undefined
  const callbackLocationMatches = callbackLocation
    ? loc.pathname.toLowerCase().startsWith(callbackLocation.pathname.toLowerCase())
    : true

  // First, try getting the auth code (sid) from hash or search params directly
  let authCode =
    new URLSearchParams(loc.hash.slice(1)).get(AUTH_CODE_PARAM) ||
    new URLSearchParams(loc.search).get(AUTH_CODE_PARAM)

  // If not found directly, try extracting it from the _context parameter as a fallback
  if (!authCode) {
    const contextParam = new URLSearchParams(loc.search).get('_context')
    if (contextParam) {
      try {
        const parsedContext = JSON.parse(contextParam)
        if (
          parsedContext &&
          typeof parsedContext === 'object' &&
          typeof parsedContext.sid === 'string' &&
          parsedContext.sid // Ensure it's not an empty string
        ) {
          authCode = parsedContext.sid
        }
      } catch {
        // Silently ignore _context JSON parsing errors; authCode remains null/empty
      }
    }
  }

  return authCode && callbackLocationMatches ? authCode : null
}

export function getTokenFromLocation(locationHref: string): string | null {
  const loc = new URL(locationHref)
  const token = new URLSearchParams(loc.hash.slice(1)).get('token')
  return token ? token : null
}

/**
 * Attempts to retrieve a token from the configured storage.
 * If invalid or not present, returns null.
 */
export function getTokenFromStorage(
  storageArea: Storage | undefined,
  storageKey: string,
): string | null {
  if (!storageArea) return null
  const item = storageArea.getItem(storageKey)
  if (item === null) return null

  try {
    const parsed: unknown = JSON.parse(item)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('token' in parsed) ||
      typeof parsed.token !== 'string'
    ) {
      throw new Error('Invalid stored auth data structure')
    }
    return parsed.token
  } catch {
    storageArea.removeItem(storageKey)
    return null
  }
}

/**
 * Creates an observable stream of storage events. If not in a browser environment,
 * returns an EMPTY observable.
 */
export function getStorageEvents(): Observable<StorageEvent> {
  const isBrowser = typeof window !== 'undefined' && typeof window.addEventListener === 'function'

  if (!isBrowser) {
    return EMPTY
  }

  return fromEvent<StorageEvent>(window, 'storage')
}

/**
 * Returns a default storage instance (localStorage) if available.
 * If not available or an error occurs, returns undefined.
 */
export function getDefaultStorage(): Storage | undefined {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Returns the default location to use.
 * Tries accessing `location.href`, falls back to a default base if not available or on error.
 */
export function getDefaultLocation(): string {
  try {
    if (typeof location === 'undefined') return DEFAULT_BASE
    if (typeof location.href === 'string') return location.href
    return DEFAULT_BASE
  } catch {
    return DEFAULT_BASE
  }
}

/**
 * Cleans up the URL by removing the `token` from the hash and the `sid` and `url` search params.
 * @internal
 */
export function getCleanedUrl(locationUrl: string): string {
  const loc = new URL(locationUrl)
  // Remove only the `token` param from the hash while preserving other fragments
  const rawHash = loc.hash.startsWith('#') ? loc.hash.slice(1) : loc.hash
  if (rawHash && rawHash.includes('=')) {
    const hashParams = new URLSearchParams(rawHash)
    hashParams.delete('token')
    hashParams.delete('withSid')
    const nextHash = hashParams.toString()
    loc.hash = nextHash ? `#${nextHash}` : ''
  }
  loc.searchParams.delete('sid')
  loc.searchParams.delete('url')
  return loc.toString()
}

// -----------------------------------------------------------------------------
// ClientError helpers (shared)
// -----------------------------------------------------------------------------

/** @internal */
export type ApiErrorBody = {
  error?: {type?: string; description?: string}
  type?: string
  description?: string
  message?: string
}

/**
 * Upper bound on how many `cause` links are followed when looking for a Sanity
 * API error inside a wrapped error. Keeps a circular `cause` chain from looping
 * forever.
 */
const MAX_ERROR_CAUSE_DEPTH = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * @internal Extracts the structured API error body from a Sanity API error, if present.
 *
 * The lookup is deliberately structural rather than an `instanceof ClientError`
 * check: an app that bundles its own copy of `@sanity/client` throws
 * `ClientError` instances that are not `instanceof` this package's copy.
 */
export function getClientErrorApiBody(error: unknown): ApiErrorBody | undefined {
  if (!isRecord(error)) return undefined
  const response = error['response']
  if (!isRecord(response)) return undefined
  const body = response['body']
  return isRecord(body) ? (body as ApiErrorBody) : undefined
}

/** @internal Returns the error type string from an API error body, if available. */
export function getClientErrorApiType(error: unknown): string | undefined {
  const body = getClientErrorApiBody(error)
  return body?.error?.type ?? body?.type
}

/** @internal Returns the error description string from an API error body, if available. */
export function getClientErrorApiDescription(error: unknown): string | undefined {
  const body = getClientErrorApiBody(error)
  return body?.error?.description ?? body?.description
}

/**
 * @internal Returns the HTTP status code reported by a Sanity API error, if available.
 *
 * Structural for the same reason as {@link getClientErrorApiBody}.
 */
export function getClientErrorStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  const statusCode = error['statusCode']
  if (typeof statusCode === 'number') return statusCode
  const response = error['response']
  const responseStatusCode = isRecord(response) ? response['statusCode'] : undefined
  return typeof responseStatusCode === 'number' ? responseStatusCode : undefined
}

/**
 * @internal Walks an error's `cause` chain and returns the first value that looks
 * like a Sanity API error, i.e. one carrying a `response` body or a `statusCode`.
 *
 * Errors surfaced through `AuthBoundary` arrive wrapped in an `AuthError` with
 * the original `ClientError` under `.cause`, and apps may add wrappers of their
 * own, so the API error is rarely the value that was caught.
 */
export function getClientErrorFromCauseChain(error: unknown): unknown {
  let candidate: unknown = error
  for (let depth = 0; isRecord(candidate) && depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
    if (
      getClientErrorApiBody(candidate) !== undefined ||
      getClientErrorStatusCode(candidate) !== undefined
    ) {
      return candidate
    }
    candidate = candidate['cause']
  }
  return undefined
}

/**
 * Returns `true` when a Sanity API error reports `projectUserNotFoundError`,
 * meaning the token's user has no member record in the project the request was
 * made against. The API raises it with a `401` status before any dataset or ACL
 * check, so it can surface from an ordinary query.
 *
 * The check inspects the API response body instead of using
 * `instanceof ClientError`, so it also recognises errors thrown by a duplicate
 * copy of `@sanity/client` bundled by the app.
 *
 * @param error - Any caught value.
 * @returns `true` if the error body reports `projectUserNotFoundError`.
 * @public
 */
export function isProjectUserNotFoundClientError(error: unknown): boolean {
  return getClientErrorApiType(error) === 'projectUserNotFoundError'
}

/**
 * Returns `true` when an error caught by an application's own error boundary
 * should be rethrown so that the SDK's `AuthBoundary` fallback handles it
 * instead of the application's generic crash screen.
 *
 * Apps normally mount their error boundary inside `<SanityApp>`, so it catches
 * project-access errors before the SDK ever sees them. Call this first and
 * rethrow when it returns `true`:
 *
 * ```tsx
 * function Fallback({error}: FallbackProps) {
 *   if (shouldDeferErrorToSdk(error)) throw error
 *   return <MyCrashScreen error={error} />
 * }
 * ```
 *
 * Detection is structural — HTTP status plus API error body, walking the
 * `cause` chain — so it keeps working when the error is wrapped and when the
 * app bundles its own copy of `@sanity/client`.
 *
 * @param error - The error caught by the application's error boundary.
 * @returns `true` when the SDK has dedicated handling for this error.
 * @public
 */
export function shouldDeferErrorToSdk(error: unknown): boolean {
  const apiError = getClientErrorFromCauseChain(error)
  return getClientErrorStatusCode(apiError) === 401 && isProjectUserNotFoundClientError(apiError)
}

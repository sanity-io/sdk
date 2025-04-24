import {EMPTY, fromEvent, Observable} from 'rxjs'

import {AUTH_CODE_PARAM, DEFAULT_BASE} from './authConstants'

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
 * Cleans up the URL by removing the hash and the sid and url parameters.
 * @internal
 */
export function getCleanedUrl(locationUrl: string): string {
  const loc = new URL(locationUrl)
  loc.hash = ''
  loc.searchParams.delete('sid')
  loc.searchParams.delete('url')
  return loc.toString()
}

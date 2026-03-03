import {type ClientConfig, type SanityClient} from '@sanity/client'

import {getTokenFromStorage} from './utils'

/**
 * Cookie auth is a best-effort probe — if the API doesn't respond quickly,
 * the user likely isn't cookie-authenticated and we should move on rather
 * than block the auth flow indefinitely.
 */
const COOKIE_AUTH_TIMEOUT_MS = 10_000

/**
 * Attempts to check for cookie auth by making a withCredentials request to the users endpoint.
 * @param projectId - The project ID to check for cookie auth.
 * @param clientFactory - A factory function that creates a Sanity client.
 * @returns True if the user is authenticated, false otherwise.
 * @internal
 */
export async function checkForCookieAuth(
  projectId: string | undefined,
  clientFactory: (config: ClientConfig) => SanityClient,
): Promise<boolean> {
  if (!projectId) return false
  try {
    const client = clientFactory({
      projectId,
      useCdn: false,
      requestTagPrefix: 'sdk',
      timeout: COOKIE_AUTH_TIMEOUT_MS,
    })
    const user = await client.request({
      uri: '/users/me',
      withCredentials: true,
      tag: 'users.get-current',
    })
    return user != null && typeof user === 'object' && typeof user.id === 'string'
  } catch {
    return false
  }
}

/**
 * Attempts to retrieve a studio token from local storage.
 * @param storageArea - The storage area to retrieve the token from.
 * @param storageKey - The storage key to retrieve the token from.
 * @returns The studio token or null if it does not exist.
 * @internal
 */
export function getStudioTokenFromLocalStorage(
  storageArea: Storage | undefined,
  storageKey: string | undefined,
): string | null {
  if (!storageArea || !storageKey) return null
  const token = getTokenFromStorage(storageArea, storageKey)
  if (token) {
    return token
  }
  return null
}

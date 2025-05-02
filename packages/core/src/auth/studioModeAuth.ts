import {type ClientConfig, type SanityClient} from '@sanity/client'

import {getTokenFromStorage} from './utils'

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
    })
    const user = await client.request({
      uri: '/users/me',
      withCredentials: true,
      tag: 'users.get-current',
    })
    return typeof user?.id === 'string'
  } catch {
    return false
  }
}

/**
 * Attempts to retrieve a studio token from local storage.
 * @param storageArea - The storage area to retrieve the token from.
 * @param projectId - The project ID to retrieve the token for.
 * @returns The studio token or null if it does not exist.
 * @internal
 */
export function getStudioTokenFromLocalStorage(
  storageArea: Storage | undefined,
  projectId: string | undefined,
): string | null {
  if (!storageArea || !projectId) return null
  const studioStorageKey = `__studio_auth_token_${projectId}`
  const token = getTokenFromStorage(storageArea, studioStorageKey)
  if (token) {
    return token
  }
  return null
}

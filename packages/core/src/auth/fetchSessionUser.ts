import type {CurrentUser} from '@sanity/types'

import type {SanityInstance} from '../instance/types'

/**
 * Fetches the current user from the Sanity API.
 * @internal
 * @param sanityInstance - The Sanity instance.
 * @param sessionId - The session ID.
 * @returns The current user or null if the user is not logged in.
 */
export const fetchSessionUser = async (
  sanityInstance: SanityInstance,
  sessionId?: string | null,
): Promise<CurrentUser | null> => {
  // eslint-disable-next-line no-console
  console.log('fetchSessionUser', sessionId)
  // eslint-disable-next-line no-console
  console.log('sanityInstance', sanityInstance)
  return null
}

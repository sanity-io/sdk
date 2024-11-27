import type {CurrentUser} from '@sanity/types'

import {getClient} from '../client/getClient.ts'
import type {SanityInstance} from '../instance/types'
import {getSessionStore} from './getSessionStore.ts'

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
  sessionId = sessionId ?? getSessionStore(sanityInstance).getState().sessionId
  // TODO: handle case where sessionId is null
  const client = getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
  const user = await client.withConfig({token: sessionId!}).request<CurrentUser>({
    method: 'GET',
    uri: `/users/me`,
  })

  getSessionStore(sanityInstance).getState().setUser(user)

  return user
}

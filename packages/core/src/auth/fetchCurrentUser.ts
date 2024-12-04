import type {CurrentUser} from '@sanity/types'

import {getClient} from '../client/getClient.ts'
import type {SanityInstance} from '../instance/types'
import {getSessionStore} from './getSessionStore.ts'

/**
 * Fetches the current user from the Sanity API.
 * @internal
 * @param sanityInstance - The Sanity instance.
 * @returns The current user or null if the user is not logged in.
 */
export const fetchCurrentUser = async (
  sanityInstance: SanityInstance,
): Promise<CurrentUser | null> => {
  const token = sanityInstance.config.token
  if (!token) {
    throw new Error('No token is set for this instance')
  }
  const client = getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
  const user = await client.withConfig({token}).request<CurrentUser>({
    method: 'GET',
    uri: `/users/me`,
  })

  getSessionStore(sanityInstance).getState().setUser(user)

  return user
}

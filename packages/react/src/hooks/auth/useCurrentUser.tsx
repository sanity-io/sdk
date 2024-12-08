import {type CurrentUser, type SanityInstance} from '@sanity/sdk'

/**
 * Hook to get the currently logged in user
 * @public
 * @param sanityInstance - The sanity instance
 * @returns The current user or null if not authenticated
 */
export const useCurrentUser = (sanityInstance: SanityInstance): CurrentUser | null => {
  // TODO: implement
  // eslint-disable-next-line no-console
  console.log('useCurrentUser', sanityInstance)
  return null
}

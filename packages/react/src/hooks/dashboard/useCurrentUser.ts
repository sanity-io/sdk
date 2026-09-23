import {type CurrentUser} from '@sanity/types'

import {useTopic} from './useTopic'

/**
 * Returns the signed-in user, or `null` while signed out.
 *
 * Suspends until Dashboard publishes the current user.
 *
 * @example
 * ```tsx
 * function CurrentUser() {
 *   const user = useCurrentUser()
 *   return <span>{user?.name ?? 'Signed out'}</span>
 * }
 * ```
 *
 * @public
 */
export function useCurrentUser(): CurrentUser | null {
  return useTopic('users.current')
}

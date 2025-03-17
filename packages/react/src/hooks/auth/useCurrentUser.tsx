import {type CurrentUser, getCurrentUserState} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 */
export interface UseCurrentUser {
  /**
   * @public
   *
   * Provides the currently authenticated user’s profile information.
   *
   * @category Users
   * @returns The current user data
   *
   * @example Rendering a basic user profile
   * ```
   * const user = useCurrentUser()
   *
   * return (
   *   <figure>
   *     <img src={user?.profileImage} alt=`Profile image for ${user?.name}` />
   *     <h2>{user?.name}</h2>
   *   </figure>
   * )
   * ```
   */
  (): CurrentUser | null
}

/**
 * @public
 * @todo This should not return null — users of a custom app will always be authenticated via Core
 */
export const useCurrentUser: UseCurrentUser = createStateSourceHook(getCurrentUserState)

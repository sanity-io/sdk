import {type CurrentUser, getCurrentUserState} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @TODO This should suspend! And possibly not return `null`?
 *
 * @public
 *
 * Provides the currently authenticated user’s profile information (their name, email, roles, etc).
 * If no users are currently logged in, the hook returns null.
 *
 * @category Authentication
 * @returns The current user data, or `null` if not authenticated
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
export const useCurrentUser: () => CurrentUser | null = createStateSourceHook(getCurrentUserState)

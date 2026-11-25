import {
  type CurrentUser,
  currentUser,
  type CurrentUserOptions,
  getCurrentUserState,
  type StateSource,
} from '@sanity/sdk'
import {useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {withSdkOrigin} from '../helpers/withSdkOrigin'

function useCurrentUserImpl(options?: CurrentUserOptions<boolean>): CurrentUser<boolean> | null {
  const instance = useSanityInstance()
  let source: Pick<
    StateSource<CurrentUser<boolean> | null>,
    'subscribe' | 'getCurrent'
  > = getCurrentUserState(instance)

  if (options?.includeUserAttributes) {
    const fetcherSource = currentUser.getState(instance, options)
    const snapshot = fetcherSource.getCurrent()

    if (snapshot.status === 'pending') throw currentUser.resolveState(instance, options)
    if (snapshot.status === 'error') throw snapshot.error

    source = {
      subscribe: fetcherSource.subscribe,
      getCurrent: () => fetcherSource.getCurrent().data ?? null,
    }
  }

  return useSyncExternalStore(source.subscribe, source.getCurrent)
}

/**
 * Provides the currently authenticated user's profile information.
 *
 * Pass `includeUserAttributes: true` to also read the user's attributes in the organization. The
 * hook then suspends until `/users/me` returns them.
 *
 * @category Users
 * @param options - Configuration options
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
 *
 * @example Reading the user's attributes
 * ```
 * const user = useCurrentUser({includeUserAttributes: true})
 * const team = user?.attributes?.find((attribute) => attribute.key === 'team')
 * ```
 *
 * @public
 * @function
 * @TODO This should not return null — users of a custom app will always be authenticated via Core
 */
export const useCurrentUser = withSdkOrigin(useCurrentUserImpl) as <
  IncludeUserAttributes extends boolean = false,
>(
  options?: CurrentUserOptions<IncludeUserAttributes>,
) => CurrentUser<IncludeUserAttributes> | null

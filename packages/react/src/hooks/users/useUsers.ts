import {createUsersStore, type ResourceType, type SanityUser} from '@sanity/sdk'
import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface UseUsersParams {
  /**
   * The type of resource to fetch users for.
   */
  resourceType: ResourceType
  /**
   * The ID of the resource to fetch users for.
   */
  resourceId: string
  /**
   * The limit of users to fetch.
   */
  limit?: number
}

/**
 * @public
 * @category Types
 */
export interface UseUsersResult {
  /**
   * The users fetched.
   */
  users: SanityUser[]
  /**
   * Whether there are more users to fetch.
   */
  hasMore: boolean
  /**
   * Load more users.
   */
  loadMore: () => void
}

/**
 *
 * @public
 *
 * Retrieves the users for a given resource (either a project or an organization).
 *
 * @category Users
 * @param params - The resource type and its ID, and the limit of users to fetch
 * @returns A list of users, a boolean indicating whether there are more users to fetch, and a function to load more users
 *
 * @example
 * ```
 * const { users, hasMore, loadMore } = useUsers({
 *   resourceType: 'organization',
 *   resourceId: 'my-org-id',
 *   limit: 10,
 * })
 *
 * return (
 *   <div>
 *     {users.map(user => (
 *       <figure key={user.sanityUserId}>
 *         <img src={user.profile.imageUrl} alt='' />
 *         <figcaption>{user.profile.displayName}</figcaption>
 *         <address>{user.profile.email}</address>
 *       </figure>
 *     ))}
 *     {hasMore && <button onClick={loadMore}>Load More</button>}
 *   </div>
 * )
 * ```
 */
export function useUsers(params: UseUsersParams): UseUsersResult {
  const instance = useSanityInstance(params.resourceId)
  const [store] = useState(() => createUsersStore(instance))

  useEffect(() => {
    store.setOptions({
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    })
  }, [params.resourceType, params.resourceId, store])

  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      if (store.getState().getCurrent().initialFetchCompleted === false) {
        store.resolveUsers()
      }
      const unsubscribe = store.getState().subscribe(onStoreChanged)

      return () => {
        unsubscribe()
        store.dispose()
      }
    },
    [store],
  )

  const getSnapshot = useCallback(() => store.getState().getCurrent(), [store])

  const {users, hasMore} = useSyncExternalStore(subscribe, getSnapshot) || {}

  return {users, hasMore, loadMore: store.loadMore}
}

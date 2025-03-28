import {
  getUsersKey,
  type GetUsersOptions,
  getUsersState,
  loadMoreUsers,
  parseUsersKey,
  resolveUsers,
  type SanityUser,
} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface UsersResult {
  /**
   * The users fetched.
   */
  data: SanityUser[]
  /**
   * Whether there are more users to fetch.
   */
  hasMore: boolean

  /**
   * Whether a users request is currently in progress
   */
  isPending: boolean
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
 * @param params - The resource type, project ID, and the limit of users to fetch
 * @returns A list of users, a boolean indicating whether there are more users to fetch, and a function to load more users
 *
 * @example
 * ```
 * const { data, hasMore, loadMore, isPending } = useUsers({
 *   resourceType: 'organization',
 *   organizationId: 'my-org-id',
 *   batchSize: 10,
 * })
 *
 * return (
 *   <div>
 *     {data.map(user => (
 *       <figure key={user.sanityUserId}>
 *         <img src={user.profile.imageUrl} alt='' />
 *         <figcaption>{user.profile.displayName}</figcaption>
 *         <address>{user.profile.email}</address>
 *       </figure>
 *     ))}
 *     {hasMore && <button onClick={loadMore}>{isPending ? 'Loading...' : 'Load More'</button>}
 *   </div>
 * )
 * ```
 */
export function useUsers(options?: GetUsersOptions): UsersResult {
  const instance = useSanityInstance(options)
  // Use React's useTransition to avoid UI jank when user options change
  const [isPending, startTransition] = useTransition()

  // Get the unique key for this users request and its options
  const key = getUsersKey(instance, options)
  // Use a deferred state to avoid immediate re-renders when the users request changes
  const [deferredKey, setDeferredKey] = useState(key)
  // Parse the deferred users key back into users options
  const deferred = useMemo(() => parseUsersKey(deferredKey), [deferredKey])

  // Create an AbortController to cancel in-flight requests when needed
  const [ref, setRef] = useState<AbortController>(new AbortController())

  // When the users request or options change, start a transition to update the request
  useEffect(() => {
    if (key === deferredKey) return

    startTransition(() => {
      if (!ref.signal.aborted) {
        ref.abort()
        setRef(new AbortController())
      }

      setDeferredKey(key)
    })
  }, [deferredKey, key, ref])

  // Get the state source for this users request from the users store
  const {getCurrent, subscribe} = useMemo(() => {
    return getUsersState(instance, deferred)
  }, [instance, deferred])

  // If data isn't available yet, suspend rendering until it is
  // This is the React Suspense integration - throwing a promise
  // will cause React to show the nearest Suspense fallback
  if (getCurrent() === undefined) {
    throw resolveUsers(instance, {...deferred, signal: ref.signal})
  }

  // Subscribe to updates and get the current data
  // useSyncExternalStore ensures the component re-renders when the data changes
  const {data, hasMore} = useSyncExternalStore(subscribe, getCurrent)!

  const loadMore = useCallback(() => {
    loadMoreUsers(instance, options)
  }, [instance, options])

  return {data, hasMore, isPending, loadMore}
}

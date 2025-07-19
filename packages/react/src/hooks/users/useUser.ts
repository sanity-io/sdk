import {
  type GetUserOptions,
  getUsersKey,
  getUsersState,
  parseUsersKey,
  resolveUsers,
  type SanityUser,
} from '@sanity/sdk'
import {useEffect, useMemo, useState, useSyncExternalStore, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface UserResult {
  /**
   * The user data fetched, or undefined if not found.
   */
  data: SanityUser | undefined
  /**
   * Whether a user request is currently in progress
   */
  isPending: boolean
}

/**
 *
 * @public
 *
 * Retrieves a single user by ID for a given resource (either a project or an organization).
 *
 * @category Users
 * @param options - The user ID, resource type, project ID, or organization ID
 * @returns The user data and loading state
 *
 * @example
 * ```
 * const { data, isPending } = useUser({
 *   userId: 'gabc123',
 *   resourceType: 'project',
 *   projectId: 'my-project-id',
 * })
 *
 * return (
 *   <div>
 *     {isPending && <p>Loading...</p>}
 *     {data && (
 *       <figure>
 *         <img src={data.profile.imageUrl} alt='' />
 *         <figcaption>{data.profile.displayName}</figcaption>
 *         <address>{data.profile.email}</address>
 *       </figure>
 *     )}
 *   </div>
 * )
 * ```
 */
export function useUser(options: GetUserOptions): UserResult {
  const instance = useSanityInstance(options)
  // Use React's useTransition to avoid UI jank when user options change
  const [isPending, startTransition] = useTransition()

  // Get the unique key for this user request and its options
  const key = getUsersKey(instance, options)
  // Use a deferred state to avoid immediate re-renders when the user request changes
  const [deferredKey, setDeferredKey] = useState(key)
  // Parse the deferred user key back into user options
  const deferred = useMemo(() => parseUsersKey(deferredKey), [deferredKey])

  // Create an AbortController to cancel in-flight requests when needed
  const [ref, setRef] = useState<AbortController>(new AbortController())

  // When the user request or options change, start a transition to update the request
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

  // Get the state source for this user request from the users store
  // We pass the userId as part of options to getUsersState
  const {getCurrent, subscribe} = useMemo(() => {
    return getUsersState(instance, deferred as GetUserOptions)
  }, [instance, deferred])

  // If data isn't available yet, suspend rendering until it is
  // This is the React Suspense integration - throwing a promise
  // will cause React to show the nearest Suspense fallback
  if (getCurrent() === undefined) {
    throw resolveUsers(instance, {...(deferred as GetUserOptions), signal: ref.signal})
  }

  // Subscribe to updates and get the current data
  // useSyncExternalStore ensures the component re-renders when the data changes
  // Extract the first user from the users array (since we're fetching by userId, there should be only one)
  const result = useSyncExternalStore(subscribe, getCurrent)
  const data = result?.data[0]

  return {data, isPending}
}

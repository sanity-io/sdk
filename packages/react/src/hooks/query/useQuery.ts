import {
  getQueryKey,
  getQueryState,
  parseQueryKey,
  type QueryOptions,
  resolveQuery,
} from '@sanity/sdk'
import {useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * React hook for executing GROQ queries against your Sanity dataset.
 *
 * This hook provides a convenient way to fetch and subscribe to real-time updates
 * for your Sanity content. It integrates with React's Suspense and Transitions APIs
 * to provide a smooth user experience.
 *
 * Features:
 * - Suspense integration: The hook will suspend rendering until data is available
 * - Real-time updates: Automatically subscribes to live updates when content changes
 * - Transition support: Uses React's useTransition to avoid UI jank when queries change
 * - Automatic cleanup: Properly manages subscriptions and aborts in-flight requests
 *
 * When the query or options change, the hook will:
 * 1. Abort any in-flight requests for the previous query
 * 2. Start a new transition to update the query
 * 3. Suspend rendering until the new data is available
 * 4. Return the new data once it's ready
 *
 * The returned `isPending` flag indicates when a transition is in progress,
 * which can be used to show loading states for query changes.
 *
 * @example
 * ```tsx
 * // Basic usage
 * const {data, isPending} = useQuery<Movie[]>('*[_type == "movie"]')
 *
 * // With parameters
 * const {data} = useQuery<Movie>('*[_type == "movie" && _id == $id][0]', {
 *   params: { id: 'movie-123' }
 * })
 *
 * // With loading state for transitions
 * const {data, isPending} = useQuery<Movie[]>('*[_type == "movie"]')
 * return (
 *   <div>
 *     {isPending && <div>Updating...</div>}
 *     <ul>
 *       {data.map(movie => <li key={movie._id}>{movie.title}</li>)}
 *     </ul>
 *   </div>
 * )
 * ```
 *
 * @param query - GROQ query string to execute
 * @param options - Optional configuration for the query
 * @returns Object containing the query result and a pending state flag
 *
 * @beta
 */
export function useQuery<T>(query: string, options?: QueryOptions): {data: T; isPending: boolean} {
  const instance = useSanityInstance(options?.resourceId)
  // Use React's useTransition to avoid UI jank when queries change
  const [isPending, startTransition] = useTransition()

  // Get the unique key for this query and its options
  const queryKey = getQueryKey(query, options)
  // Use a deferred state to avoid immediate re-renders when the query changes
  const [deferredQueryKey, setDeferredQueryKey] = useState(queryKey)
  // Parse the deferred query key back into a query and options
  const deferred = useMemo(() => parseQueryKey(deferredQueryKey), [deferredQueryKey])

  // Create an AbortController to cancel in-flight requests when needed
  const ref = useRef<AbortController | null>(null)
  if (ref.current === null) {
    ref.current = new AbortController()
  }

  // When the query or options change, start a transition to update the query
  useEffect(() => {
    if (queryKey === deferredQueryKey) return

    startTransition(() => {
      // Abort any in-flight requests for the previous query
      if (ref.current && !ref.current.signal.aborted) {
        ref.current.abort()
        ref.current = new AbortController()
      }

      setDeferredQueryKey(queryKey)
    })
  }, [deferredQueryKey, queryKey])

  // Get the state source for this query from the query store
  const {getCurrent, subscribe} = useMemo(
    () => getQueryState(instance, deferred.query, deferred.options),
    [instance, deferred],
  )

  // If data isn't available yet, suspend rendering until it is
  // This is the React Suspense integration - throwing a promise
  // will cause React to show the nearest Suspense fallback
  if (getCurrent() === undefined) {
    throw resolveQuery(instance, deferred.query, {...deferred.options, signal: ref.current.signal})
  }

  // Subscribe to updates and get the current data
  // useSyncExternalStore ensures the component re-renders when the data changes
  const data = useSyncExternalStore(subscribe, getCurrent) as T
  return {data, isPending}
}

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
 * Executes GROQ queries against a Sanity dataset.
 *
 * This hook provides a convenient way to fetch and subscribe to real-time updates
 * for your Sanity content. Changes made to the dataset's content will trigger
 * automatic updates.
 *
 * @remarks
 * The returned `isPending` flag indicates when a React transition is in progress,
 * which can be used to show loading states for query changes.
 *
 * @beta
 * @category GROQ
 * @param query - GROQ query string to execute
 * @param options - Optional configuration for the query, including projectId and dataset
 * @returns Object containing the query result and a pending state flag
 *
 * @example Basic usage
 * ```tsx
 * const {data, isPending} = useQuery<Movie[]>('*[_type == "movie"]')
 * ```
 *
 * @example Using parameters
 * ```tsx
 * // With parameters
 * const {data} = useQuery<Movie>('*[_type == "movie" && _id == $id][0]', {
 *   params: { id: 'movie-123' }
 * })
 * ```
 *
 * @example Query from a specific project/dataset
 * ```tsx
 * // Specify which project and dataset to query
 * const {data} = useQuery<Movie[]>('*[_type == "movie"]', {
 *   projectId: 'abc123',
 *   dataset: 'production'
 * })
 * ```
 *
 * @example With a loading state for transitions
 * ```tsx
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
 */
export function useQuery<T>(query: string, options?: QueryOptions): {data: T; isPending: boolean} {
  const instance = useSanityInstance(options)

  // Use React's useTransition to avoid UI jank when queries change
  const [isPending, startTransition] = useTransition()

  // Get the unique key for this query and its options
  const queryKey = getQueryKey(query, options)
  // Use a deferred state to avoid immediate re-renders when the query changes
  const [deferredQueryKey, setDeferredQueryKey] = useState(queryKey)
  // Parse the deferred query key back into a query and options
  const deferred = useMemo(() => parseQueryKey(deferredQueryKey), [deferredQueryKey])

  // Create an AbortController to cancel in-flight requests when needed
  const ref = useRef<AbortController>(new AbortController())

  // When the query or options change, start a transition to update the query
  useEffect(() => {
    if (queryKey === deferredQueryKey) return

    startTransition(() => {
      // Abort any in-flight requests for the previous query
      if (ref && !ref.current.signal.aborted) {
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

  // If data isn't available yet, suspend rendering
  if (getCurrent() === undefined) {
    // Safe to access ref.current here because we're guaranteed to suspend - React will
    // re-run this component after the promise resolves, at which point effects would
    // have run and any ref updates would be visible. During this render pass, since
    // we're throwing, no effects/state updates can occur that might mutate the ref.
    // eslint-disable-next-line react-compiler/react-compiler
    throw resolveQuery(instance, deferred.query, {...deferred.options, signal: ref.current.signal})
  }

  // Subscribe to updates and get the current data
  // useSyncExternalStore ensures the component re-renders when the data changes
  const data = useSyncExternalStore(subscribe, getCurrent) as T
  return {data, isPending}
}

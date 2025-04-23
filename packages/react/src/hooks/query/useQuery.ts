import {
  getQueryKey,
  getQueryState,
  parseQueryKey,
  type QueryOptions,
  resolveQuery,
} from '@sanity/sdk'
import {type SanityQueryResult} from 'groq'
import {useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

// Overload 1: Inferred Type (using Typegen)
/**
 * @beta
 * Executes a GROQ query, inferring the result type from the query string and options.
 * Leverages Sanity Typegen if configured for enhanced type safety.
 *
 * @param options - Configuration for the query, including `query`, optional `params`, `projectId`, `dataset`, etc.
 * @returns An object containing `data` (typed based on the query) and `isPending` (for transitions).
 *
 * @example Basic usage (Inferred Type)
 * ```tsx
 * import {useQuery} from '@sanity/sdk-react'
 * import {defineQuery} from 'groq'
 *
 * const myQuery = defineQuery(`*[_type == "movie"]{_id, title}`)
 *
 * function MovieList() {
 *   // Typegen infers the return type for data
 *   const {data, isPending} = useQuery({ query: myQuery })
 *
 *   return (
 *     <div style={{ opacity: isPending ? 0.5 : 1 }}>
 *       <h2>Movies</h2>
 *       <ul>
 *         {data.map(movie => <li key={movie._id}>{movie.title}</li>)}
 *       </ul>
 *     </div>
 *   )
 * }
 * // Suspense boundary should wrap <MovieList /> for initial load
 * ```
 *
 * @example Using parameters (Inferred Type)
 * ```tsx
 * import {useQuery} from '@sanity/sdk-react'
 * import {defineQuery} from 'groq'
 *
 * const myQuery = defineQuery(`*[_type == "movie" && _id == $id][0]`)
 *
 * function MovieDetails({movieId}: {movieId: string}) {
 *   // Typegen infers the return type based on query and params
 *   const {data, isPending} = useQuery({
 *     query: myQuery,
 *     params: { id: movieId }
 *   })
 *
 *   return (
 *     <div style={{ opacity: isPending ? 0.5 : 1 }}>
 *       {data ? <h1>{data.title}</h1> : <p>Movie not found</p>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useQuery<
  TQuery extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: QueryOptions<TQuery, TDataset, TProjectId>,
): {
  /** The query result, typed based on the GROQ query string */
  data: SanityQueryResult<TQuery, TDataset, TProjectId>
  /** True if a query transition is in progress */
  isPending: boolean
}

// Overload 2: Explicit Type Provided
/**
 * @beta
 * Executes a GROQ query with an explicitly provided result type `TData`.
 *
 * @param options - Configuration for the query, including `query`, optional `params`, `projectId`, `dataset`, etc.
 * @returns An object containing `data` (cast to `TData`) and `isPending` (for transitions).
 *
 * @example Manually typed query result
 * ```tsx
 * import {useQuery} from '@sanity/sdk-react'
 *
 * interface CustomMovieTitle {
 *   movieTitle?: string
 * }
 *
 * function FirstMovieTitle() {
 *   // Provide the explicit type TData
 *   const {data, isPending} = useQuery<CustomMovieTitle>({
 *     query: '*[_type == "movie"][0]{ "movieTitle": title }'
 *   })
 *
 *   return (
 *     <h1 style={{ opacity: isPending ? 0.5 : 1 }}>
 *       {data?.movieTitle ?? 'No title found'}
 *     </h1>
 *   )
 * }
 * ```
 */
export function useQuery<TData>(options: QueryOptions): {
  /** The query result, cast to the provided type TData */
  data: TData
  /** True if a query transition is in progress */
  isPending: boolean
}

/**
 * @beta
 * Fetches data and subscribes to real-time updates using a GROQ query.
 *
 * @remarks
 * This hook provides a convenient way to fetch data from your Sanity dataset and
 * automatically receive updates in real-time when the queried data changes.
 *
 * Features:
 * - Executes any valid GROQ query.
 * - Subscribes to changes, providing real-time updates.
 * - Integrates with React Suspense for handling initial loading states.
 * - Uses React Transitions for managing loading states during query/parameter changes (indicated by `isPending`).
 * - Supports type inference based on the GROQ query when using Sanity Typegen.
 * - Allows specifying an explicit return type `TData` for the query result.
 *
 * @category GROQ
 */
export function useQuery(options: QueryOptions): {data: unknown; isPending: boolean} {
  // Implementation returns unknown, overloads define specifics
  const instance = useSanityInstance(options)

  // Use React's useTransition to avoid UI jank when queries change
  const [isPending, startTransition] = useTransition()

  // Get the unique key for this query and its options
  const queryKey = getQueryKey(options)
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
    () => getQueryState(instance, deferred),
    [instance, deferred],
  )

  // If data isn't available yet, suspend rendering
  if (getCurrent() === undefined) {
    // Normally, reading from a mutable ref during render can be risky in concurrent mode.
    // However, it is safe here because:
    // 1. React guarantees that while the component is suspended (via throwing a promise),
    //    no effects or state updates occur during that render pass.
    // 2. We immediately capture the current abort signal in a local variable (currentSignal).
    // 3. Even if a background render updates ref.current (for example, due to a query change),
    //    the captured signal remains unchanged for this suspended render.
    // Thus, the promise thrown here uses a stable abort signal, ensuring correct behavior.
    const currentSignal = ref.current.signal
    // eslint-disable-next-line react-compiler/react-compiler
    throw resolveQuery(instance, {...deferred, signal: currentSignal})
  }

  // Subscribe to updates and get the current data
  // useSyncExternalStore ensures the component re-renders when the data changes
  const data = useSyncExternalStore(subscribe, getCurrent) as SanityQueryResult
  return useMemo(() => ({data, isPending}), [data, isPending])
}

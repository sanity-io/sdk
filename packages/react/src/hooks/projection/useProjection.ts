import {
  type DocumentHandle,
  getProjectionState,
  resolveProjection,
  type ValidProjection,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

interface UseProjectionOptions {
  document: DocumentHandle
  projection: ValidProjection
  ref?: React.RefObject<unknown>
}

interface UseProjectionResults<TResult extends object> {
  results: TResult
  isPending: boolean
}

/**
 * @beta
 *
 * Returns the projection values of a document (specified via a `DocumentHandle`),
 * based on the provided projection string. These values are live and will update in realtime.
 * To reduce unnecessary network requests for resolving the projection values, an optional `ref` can be passed to the hook so that projection
 * resolution will only occur if the `ref` is intersecting the current viewport.
 *
 * @category Documents
 * @param options - The document handle for the document you want to project values from, the projection string, and an optional ref
 * @returns The projection values for the given document and a boolean to indicate whether the resolution is pending
 *
 * @example Using a projection to display specific document fields
 * ```
 * // ProjectionComponent.jsx
 * export default function ProjectionComponent({ document }) {
 *   const ref = useRef(null)
 *   const { results: { title, description, authors }, isPending } = useProjection({
 *     document,
 *     projection: '{title, "description": pt::text("description"), "authors": array::join(authors[]->name, ", ")}',
 *     ref
 *   })
 *
 *   return (
 *     <article ref={ref} style={{ opacity: isPending ? 0.5 : 1}}>
 *       <h2>{title}</h2>
 *       <p>{description}</p>
 *       <p>{authors}</p>
 *     </article>
 *   )
 * }
 * ```
 *
 * @example Combining with useInfiniteList to render a collection with specific fields
 * ```
 * // DocumentList.jsx
 * const { data } = useInfiniteList({ filter: '_type == "article"' })
 * return (
 *   <div>
 *     <h1>Articles</h1>
 *     <ul>
 *       {data.map(article => (
 *         <li key={article._id}>
 *           <Suspense fallback='Loading…'>
 *             <ProjectionComponent
 *               document={article}
 *             />
 *           </Suspense>
 *         </li>
 *       ))}
 *     </ul>
 *   </div>
 * )
 * ```
 */
export function useProjection<TResult extends object>({
  document: {_id, _type},
  projection,
  ref,
}: UseProjectionOptions): UseProjectionResults<TResult> {
  const instance = useSanityInstance()

  const stateSource = useMemo(
    () => getProjectionState<TResult>(instance, {document: {_id, _type}, projection}),
    [instance, _id, _type, projection],
  )

  // Create subscribe function for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      const subscription = new Observable<boolean>((observer) => {
        // for environments that don't have an intersection observer
        if (typeof IntersectionObserver === 'undefined' || typeof HTMLElement === 'undefined') {
          return
        }

        const intersectionObserver = new IntersectionObserver(
          ([entry]) => observer.next(entry.isIntersecting),
          {rootMargin: '0px', threshold: 0},
        )
        if (ref?.current && ref.current instanceof HTMLElement) {
          intersectionObserver.observe(ref.current)
        }
        return () => intersectionObserver.disconnect()
      })
        .pipe(
          startWith(false),
          distinctUntilChanged(),
          switchMap((isVisible) =>
            isVisible
              ? new Observable<void>((obs) => {
                  return stateSource.subscribe(() => obs.next())
                })
              : EMPTY,
          ),
        )
        .subscribe({next: onStoreChanged})

      return () => subscription.unsubscribe()
    },
    [stateSource, ref],
  )

  // Create getSnapshot function to return current state
  const getSnapshot = useCallback(() => {
    const currentState = stateSource.getCurrent()
    if (currentState.results === null)
      throw resolveProjection(instance, {document: {_id, _type}, projection})
    return currentState as UseProjectionResults<TResult>
  }, [_id, _type, projection, instance, stateSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}

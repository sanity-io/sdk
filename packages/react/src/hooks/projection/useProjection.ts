import {
  type DocumentHandle,
  getProjectionState,
  resolveProjection,
  type ValidProjection,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface UseProjectionOptions {
  document: DocumentHandle
  projection: ValidProjection
  ref?: React.RefObject<unknown>
}

/**
 * @public
 * @category Types
 */
export interface UseProjectionResults<TResult extends object> {
  data: TResult
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
 * @example Using a projection to render a preview of document
 * ```
 * // ProjectionComponent.jsx
 * export default function ProjectionComponent({ document }) {
 *   const ref = useRef(null)
 *   const { results: { title, coverImage, authors }, isPending } = useProjection({
 *     document,
 *     ref,
 *     projection: `{
 *       title,
 *       'coverImage': cover.asset->url,
 *       'authors': array::join(authors[]->{'name': firstName + ' ' + lastName + ' '}.name, ', ')
 *     }`,
 *   })
 *
 *   return (
 *     <article ref={ref} style={{ opacity: isPending ? 0.5 : 1}}>
 *       <h2>{title}</h2>
 *       <img src={coverImage} alt={title} />
 *       <p>{authors}</p>
 *     </article>
 *   )
 * }
 * ```
 *
 * @example Combining with useDocuments to render a collection with specific fields
 * ```
 * // DocumentList.jsx
 * const { data } = useDocuments({ filter: '_type == "article"' })
 * return (
 *   <div>
 *     <h1>Books</h1>
 *     <ul>
 *       {data.map(book => (
 *         <li key={book._id}>
 *           <Suspense fallback='Loading…'>
 *             <ProjectionComponent
 *               document={book}
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
    if (currentState.data === null)
      throw resolveProjection(instance, {document: {_id, _type}, projection})
    return currentState as UseProjectionResults<TResult>
  }, [_id, _type, projection, instance, stateSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}

import {
  type DocumentHandle,
  getProjectionState,
  resolveProjection,
  type ValidProjection,
} from '@sanity/sdk'
import {useCallback, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface UseProjectionOptions extends DocumentHandle {
  ref?: React.RefObject<unknown>
  projection: ValidProjection
}

/**
 * @public
 * @category Types
 */
export interface UseProjectionResults<TData extends object> {
  data: TData
  isPending: boolean
}

/**
 * @public
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
 *   const { data: { title, coverImage, authors }, isPending } = useProjection({
 *     ...document,
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
export function useProjection<TData extends object>({
  ref,
  projection,
  ...docHandle
}: UseProjectionOptions): UseProjectionResults<TData> {
  const instance = useSanityInstance()
  const stateSource = getProjectionState<TData>(instance, {...docHandle, projection})

  if (stateSource.getCurrent().data === null) {
    throw resolveProjection(instance, {...docHandle, projection})
  }

  // Create subscribe function for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      const subscription = new Observable<boolean>((observer) => {
        // For environments that don't have an intersection observer (e.g. server-side),
        // we pass true to always subscribe since we can't detect visibility
        if (typeof IntersectionObserver === 'undefined' || typeof HTMLElement === 'undefined') {
          observer.next(true)
          return
        }

        const intersectionObserver = new IntersectionObserver(
          ([entry]) => observer.next(entry.isIntersecting),
          {rootMargin: '0px', threshold: 0},
        )
        if (ref?.current && ref.current instanceof HTMLElement) {
          intersectionObserver.observe(ref.current)
        } else {
          // If no ref is provided or ref.current isn't an HTML element,
          // pass true to always subscribe since we can't track visibility
          observer.next(true)
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

  return useSyncExternalStore(subscribe, stateSource.getCurrent) as UseProjectionResults<TData>
}

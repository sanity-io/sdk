import {type DocumentHandle, getPreviewState, type PreviewValue, resolvePreview} from '@sanity/sdk'
import {useCallback, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @beta
 * @category Types
 */
export interface UsePreviewOptions extends DocumentHandle {
  /**
   * Optional ref object to track visibility. When provided, preview resolution
   * only occurs when the referenced element is visible in the viewport.
   */
  ref?: React.RefObject<unknown>
}

/**
 * @beta
 * @category Types
 */
export interface UsePreviewResults {
  /** The results of resolving the document’s preview values */
  data: PreviewValue
  /** True when preview values are being refreshed */
  isPending: boolean
}

/**
 * @beta
 *
 * Returns the preview values of a document (specified via a `DocumentHandle`),
 * including the document’s `title`, `subtitle`, `media`, and `status`. These values are live and will update in realtime.
 * To reduce unnecessary network requests for resolving the preview values, an optional `ref` can be passed to the hook so that preview
 * resolution will only occur if the `ref` is intersecting the current viewport.
 *
 * @category Documents
 * @param options - The document handle for the document you want to resolve preview values for, and an optional ref
 * @returns The preview values for the given document and a boolean to indicate whether the resolution is pending
 *
 * @example Combining with useDocuments to render a collection of document previews
 * ```
 * // PreviewComponent.jsx
 * export default function PreviewComponent({ document }) {
 *   const { data: { title, subtitle, media }, isPending } = usePreview({ document })
 *   return (
 *     <article style={{ opacity: isPending ? 0.5 : 1}}>
 *       {media?.type === 'image-asset' ? <img src={media.url} alt='' /> : ''}
 *       <h2>{title}</h2>
 *       <p>{subtitle}</p>
 *     </article>
 *   )
 * }
 *
 * // DocumentList.jsx
 * const { data } = useDocuments({ filter: '_type == "movie"' })
 * return (
 *   <div>
 *     <h1>Movies</h1>
 *     <ul>
 *       {data.map(movie => (
 *         <li key={movie._id}>
 *           <Suspense fallback='Loading…'>
 *             <PreviewComponent document={movie} />
 *           </Suspense>
 *         </li>
 *       ))}
 *     </ul>
 *   </div>
 * )
 * ```
 */
export function usePreview({ref, ...docHandle}: UsePreviewOptions): UsePreviewResults {
  const instance = useSanityInstance()
  const stateSource = getPreviewState(instance, docHandle)

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

  // Create getSnapshot function to return current state
  const getSnapshot = useCallback(() => {
    const currentState = stateSource.getCurrent()
    if (currentState.data === null) throw resolvePreview(instance, docHandle)
    return currentState as UsePreviewResults
  }, [docHandle, instance, stateSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}

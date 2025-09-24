import {
  getPreviewState,
  type GetPreviewStateOptions,
  type PreviewValue,
  resolvePreview,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {type SourceOptions} from '../../type'
import {useSanityInstanceAndSource} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface useDocumentPreviewOptions
  extends Omit<GetPreviewStateOptions, 'source'>,
    SourceOptions {
  /**
   * Optional ref object to track visibility. When provided, preview resolution
   * only occurs when the referenced element is visible in the viewport.
   */
  ref?: React.RefObject<unknown>
}

/**
 * @public
 * @category Types
 */
export interface useDocumentPreviewResults {
  /** The results of inferring the document’s preview values */
  data: PreviewValue
  /** True when inferred preview values are being refreshed */
  isPending: boolean
}

/**
 * @public
 *
 * Attempts to infer preview values of a document (specified via a `DocumentHandle`),
 * including the document’s `title`, `subtitle`, `media`, and `status`. These values are live and will update in realtime.
 * To reduce unnecessary network requests for resolving the preview values, an optional `ref` can be passed to the hook so that preview
 * resolution will only occur if the `ref` is intersecting the current viewport.
 *
 * See remarks below for futher information.
 *
 * @remarks
 * Values returned by this hook may not be as expected. It is currently unable to read preview values as defined in your schema;
 * instead, it attempts to infer these preview values by checking against a basic set of potential fields on your document.
 * We are anticipating being able to significantly improve this hook’s functionality and output in a future release.
 * For now, we recommend using {@link useDocumentProjection} for rendering individual document fields (or projections of those fields).
 *
 * @category Documents
 * @param options - The document handle for the document you want to infer preview values for, and an optional ref
 * @returns The inferred values for the given document and a boolean to indicate whether the resolution is pending
 *
 * @example Combining with useDocuments to render a collection of document previews
 * ```
 * // PreviewComponent.jsx
 * export default function PreviewComponent({ document }) {
 *   const { data: { title, subtitle, media }, isPending } = useDocumentPreview({ document })
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
export function useDocumentPreview({
  ref,
  projectId,
  dataset,
  source,
  ...docHandle
}: useDocumentPreviewOptions): useDocumentPreviewResults {
  const [instance, actualSource] = useSanityInstanceAndSource({projectId, dataset, source})
  const options = useMemo(() => ({...docHandle, source: actualSource}), [docHandle, actualSource])
  const stateSource = getPreviewState(instance, options)

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
    if (currentState.data === null) throw resolvePreview(instance, options)
    return currentState as useDocumentPreviewResults
  }, [instance, options, stateSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}

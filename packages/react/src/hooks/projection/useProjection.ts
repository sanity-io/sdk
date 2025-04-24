import {
  type DocumentHandle,
  getProjectionState,
  resolveProjection,
  type ValidProjection,
} from '@sanity/sdk'
import {type SanityProjectionResult} from 'groq'
import {useCallback, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * @category Types
 */
export interface UseProjectionOptions<
  TProjection extends ValidProjection = ValidProjection,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  /** The GROQ projection string */
  projection: TProjection
  /** Optional parameters for the projection query */
  params?: Record<string, unknown>
  /** Optional ref to track viewport intersection for lazy loading */
  ref?: React.RefObject<unknown>
}

/**
 * @public
 * @category Types
 */
export interface UseProjectionResults<TData> {
  /** The projected data */
  data: TData
  /** True if the projection is currently being resolved */
  isPending: boolean
}

/**
 * @public
 *
 * Returns the projected values of a document based on the provided projection string.
 * These values are live and will update in realtime.
 * To optimize network requests, an optional `ref` can be passed to only resolve the projection
 * when the referenced element is intersecting the viewport.
 *
 * @category Documents
 * @remarks
 * This hook has multiple signatures allowing for fine-grained control over type inference:
 * - Using Typegen: Infers the return type based on the `documentType`, `dataset`, `projectId`, and `projection`.
 * - Using explicit type parameter: Allows specifying a custom return type `TData`.
 *
 * @param options - An object containing the `DocumentHandle` properties (`documentId`, `documentType`, etc.), the `projection` string, optional `params`, and an optional `ref`.
 * @returns An object containing the projection results (`data`) and a boolean indicating whether the resolution is pending (`isPending`). Note: Suspense handles initial loading states; `data` being `undefined` after initial loading means the document doesn't exist or the projection yielded no result.
 */

// Overload 1: Relies on Typegen
/**
 * @beta
 * Fetch a projection, relying on Typegen for the return type based on the handle and projection.
 *
 * @category Documents
 * @param options - Options including the document handle properties (`documentId`, `documentType`, etc.) and the `projection`.
 * @returns The projected data, typed based on Typegen.
 *
 * @example Using Typegen for a book preview
 * ```tsx
 * // ProjectionComponent.tsx
 * import {useProjection, type DocumentHandle} from '@sanity/sdk-react'
 * import {useRef} from 'react'
 * import {defineProjection} from 'groq'
 *
 * // Define props using DocumentHandle with the specific document type
 * type ProjectionComponentProps = {
 *   doc: DocumentHandle<'book'> // Typegen knows 'book'
 * }
 *
 * // This is required for typegen to generate the correct return type
 * const myProjection = defineProjection(`{
 *   title,
 *   'coverImage': cover.asset->url,
 *   'authors': array::join(authors[]->{'name': firstName + ' ' + lastName}.name, ', ')
 * }`)
 *
 * export default function ProjectionComponent({ doc }: ProjectionComponentProps) {
 *   const ref = useRef(null) // Optional ref to track viewport intersection for lazy loading
 *
 *   // Spread the doc handle into the options
 *   // Typegen infers the return type based on 'book' and the projection
 *   const { data } = useProjection({
 *     ...doc, // Pass the handle properties
 *     ref,
 *     projection: myProjection,
 *   })
 *
 *   // Suspense handles initial load, check for data existence after
 *   return (
 *     <article ref={ref}>
 *       <h2>{data.title ?? 'Untitled'}</h2>
 *       {data.coverImage && <img src={data.coverImage} alt={data.title} />}
 *       <p>{data.authors ?? 'Unknown authors'}</p>
 *     </article>
 *   )
 * }
 *
 * // Usage:
 * // import {createDocumentHandle} from '@sanity/sdk-react'
 * // const myDocHandle = createDocumentHandle({ documentId: 'book123', documentType: 'book' })
 * // <Suspense fallback='Loading preview...'>
 * //   <ProjectionComponent doc={myDocHandle} />
 * // </Suspense>
 * ```
 */
export function useProjection<
  TProjection extends ValidProjection = ValidProjection,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: UseProjectionOptions<TProjection, TDocumentType, TDataset, TProjectId>,
): UseProjectionResults<SanityProjectionResult<TProjection, TDocumentType, TDataset, TProjectId>>

// Overload 2: Explicit type provided
/**
 * @beta
 * Fetch a projection with an explicitly defined return type `TData`.
 *
 * @param options - Options including the document handle properties (`documentId`, etc.) and the `projection`.
 * @returns The projected data, cast to the explicit type `TData`.
 *
 * @example Explicitly typing the projection result
 * ```tsx
 * import {useProjection, type DocumentHandle} from '@sanity/sdk-react'
 * import {useRef} from 'react'
 *
 * interface SimpleBookPreview {
 *   title?: string;
 *   authorName?: string;
 * }
 *
 * type BookPreviewProps = {
 *   doc: DocumentHandle
 * }
 *
 * function BookPreview({ doc }: BookPreviewProps) {
 *   const ref = useRef(null)
 *   const { data } = useProjection<SimpleBookPreview>({
 *     ...doc,
 *     ref,
 *     projection: `{ title, 'authorName': author->name }`
 *   })
 *
 *   return (
 *     <div ref={ref}>
 *       <h3>{data.title ?? 'No Title'}</h3>
 *       <p>By: {data.authorName ?? 'Unknown'}</p>
 *     </div>
 *   )
 * }
 *
 * // Usage:
 * // import {createDocumentHandle} from '@sanity/sdk-react'
 * // const doc = createDocumentHandle({ documentId: 'abc', documentType: 'book' })
 * // <Suspense fallback='Loading...'>
 * //   <BookPreview doc={doc} />
 * // </Suspense>
 * ```
 */
export function useProjection<TData extends object>(
  options: UseProjectionOptions, // Uses base options type
): UseProjectionResults<TData>

// Implementation (no JSDoc needed here as it's covered by overloads)
export function useProjection<TData extends object>({
  ref,
  projection,
  ...options
}: UseProjectionOptions): UseProjectionResults<TData> {
  const instance = useSanityInstance(options)
  // Use the core options type here which might be slightly different
  const stateSource = getProjectionState<TData>(instance, {projection, ...options})

  // Throw promise for Suspense if initial data is not available (null indicates it resolved but found nothing)
  if (stateSource.getCurrent()?.data === undefined) {
    throw resolveProjection(instance, {projection, ...options})
  }

  // Create subscribe function for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      const isVisible$ = new Observable<boolean>((observer) => {
        // For environments that don't have an intersection observer (e.g. server-side),
        // always subscribe.
        if (
          typeof IntersectionObserver === 'undefined' ||
          typeof HTMLElement === 'undefined' ||
          !ref?.current ||
          !(ref.current instanceof HTMLElement)
        ) {
          observer.next(true)
          return
        }

        const targetElement = ref.current
        const intersectionObserver = new IntersectionObserver(
          ([entry]) => observer.next(entry.isIntersecting),
          {rootMargin: '0px', threshold: 0},
        )
        intersectionObserver.observe(targetElement)
        return () => intersectionObserver.disconnect()
      }).pipe(startWith(false), distinctUntilChanged()) // Start inactive, only emit changes

      const subscription = isVisible$
        .pipe(
          // Switch to the stateSource only when visible, otherwise switch to EMPTY
          switchMap((isVisible) =>
            isVisible
              ? new Observable<void>((obs) => stateSource.subscribe(() => obs.next())) // Wrap subscribe
              : EMPTY,
          ),
        )
        .subscribe({next: onStoreChanged})

      return () => subscription.unsubscribe()
    },
    [stateSource, ref],
  )

  // Get current state and memoize result (though useSyncExternalStore handles memoization)
  const currentState = useSyncExternalStore(subscribe, stateSource.getCurrent)

  // Return the data and pending status
  return {
    data: currentState?.data as TData,
    isPending: currentState?.isPending ?? true, // Consider pending if state is somehow undefined
  }
}

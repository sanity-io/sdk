import {type PreviewQueryResult, type PreviewValue} from '@sanity/sdk'
import {PREVIEW_PROJECTION, transformProjectionToPreview} from '@sanity/sdk/_internal'
import {useMemo} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'
import {useDocumentProjection} from '../projection/useDocumentProjection'

/**
 * @public
 * @category Types
 */
export interface useDocumentPreviewOptions extends DocumentHandle {
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
  /** The results of inferring the document's preview values */
  data: PreviewValue
  /** True when inferred preview values are being refreshed */
  isPending: boolean
}

/**
 * @public
 *
 * Attempts to infer preview values of a document (specified via a `DocumentHandle`),
 * including the document's `title`, `subtitle`, `media`, and `status`. These values are live and will update in realtime.
 * To reduce unnecessary network requests for resolving the preview values, an optional `ref` can be passed to the hook so that preview
 * resolution will only occur if the `ref` is intersecting the current viewport.
 *
 * See remarks below for futher information.
 *
 * @remarks
 * Values returned by this hook may not be as expected. It is currently unable to read preview values as defined in your schema;
 * instead, it attempts to infer these preview values by checking against a basic set of potential fields on your document.
 * We are anticipating being able to significantly improve this hook's functionality and output in a future release.
 * For now, we recommend using {@link useDocumentProjection} for rendering individual document fields (or projections of those fields).
 *
 * Internally, this hook is implemented as a specialized projection with post-processing logic.
 * It uses a fixed GROQ projection to fetch common preview fields (title, subtitle, media) and
 * transforms the results into the PreviewValue format.
 *
 * @category Documents
 * @param options - The document handle for the document you want to infer preview values for, and an optional ref
 * @returns The inferred values for the given document and a boolean to indicate whether the resolution is pending
 *
 * @example Combining with useDocuments to render a collection of document previews
 * ```
 * // PreviewComponent.tsx
 * export default function PreviewComponent(docHandle: DocumentHandle) {
 *   const { data: { title, subtitle, media }, isPending } = useDocumentPreview(docHandle)
 *   return (
 *     <article style={{ opacity: isPending ? 0.5 : 1}}>
 *       {media?.type === 'image-asset' ? <img src={media.url} alt='' /> : ''}
 *       <h2>{title}</h2>
 *       <p>{subtitle}</p>
 *     </article>
 *   )
 * }
 *
 * // DocumentList.tsx
 * const { data } = useDocuments({ documentType: 'movie' })
 * return (
 *   <div>
 *     <h1>Movies</h1>
 *     <ul>
 *       {data.map(movie => (
 *         <li key={movie.documentId}>
 *           <Suspense fallback='Loading…'>
 *             <PreviewComponent {...movie} />
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
  ...docHandle
}: useDocumentPreviewOptions): useDocumentPreviewResults {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useDocumentPreview')
  const normalizedDocHandle = useNormalizedResourceOptions(docHandle)

  // Use the projection hook with the fixed preview projection
  const projectionResult = useDocumentProjection<PreviewQueryResult>({
    ...normalizedDocHandle,
    projection: PREVIEW_PROJECTION,
    ref,
  })

  // Contract: useDocumentProjection suspends while data is null, so data is always available here.
  // Keep this non-null assumption aligned with useDocumentPreviewResults.data.
  const previewValue = useMemo(
    () =>
      transformProjectionToPreview(instance, normalizedDocHandle.resource, projectionResult.data),
    [projectionResult.data, instance, normalizedDocHandle.resource],
  )

  return {
    data: previewValue,
    isPending: projectionResult.isPending,
  }
}

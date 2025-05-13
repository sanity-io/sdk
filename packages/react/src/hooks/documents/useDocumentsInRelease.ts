import {type DatasetHandle} from '@sanity/sdk'

import {type DocumentsResponse, useDocuments} from './useDocuments'

/**
 * Hook to get documents that are part of a specific release.
 *
 * @public
 * @category Documents
 * @param options - Configuration including the release perspective and dataset handle
 * @returns The documents that are part of the release
 *
 * @example
 * ```tsx
 * import {useDocumentsInRelease, createDatasetHandle} from '@sanity/sdk-react'
 *
 * function ReleaseDocuments({releaseName}: {releaseName: string}) {
 *   const dataset = createDatasetHandle({ projectId: 'abc123', dataset: 'production' })
 *   const {data} = useDocumentsInRelease({
 *     dataset,
 *     releasePerspective: {releaseName}
 *   })
 *   return (
 *     <ul>
 *       {data.map(doc => (
 *         <li key={doc.documentId}>{doc.documentType}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useDocumentsInRelease<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: DatasetHandle<TDataset, TProjectId>,
): DocumentsResponse<TDocumentType, TDataset, TProjectId> {
  const {perspective, ...datasetHandle} = options

  if (!perspective || typeof perspective !== 'object' || !('releaseName' in perspective)) {
    throw new Error(
      'useDocumentsInRelease requires a valid ReleasePerspective as the `perspective` option',
    )
  }

  return useDocuments<TDocumentType, TDataset, TProjectId>({
    ...datasetHandle,
    perspective: 'raw',
    filter: 'sanity::partOfRelease($releaseId)',
    params: {
      releaseId: perspective.releaseName,
    },
  })
}

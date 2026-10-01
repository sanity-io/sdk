import {useDocuments} from '@sanity/sdk-react'
import {useSearchParams} from 'react-router'

/**
 * The document a route works on: `?documentId=` when given, otherwise the most
 * recently created one of its type.
 *
 * A default means the route is useful the moment it opens, with no id to look up
 * first. The ordering is explicit rather than left to the API's default, because
 * the collaborative routes only demonstrate anything if every tab lands on the
 * same document.
 *
 * `undefined` when the dataset has no such document, or when an id was asked for
 * and does not exist.
 */
export function useDefaultDocumentId(documentType: string): {
  documentId: string | undefined
  documentIdParam: string | null
} {
  const [searchParams] = useSearchParams()
  const documentIdParam = searchParams.get('documentId')

  const {data} = useDocuments({
    documentType,
    batchSize: 1,
    orderings: [{field: '_createdAt', direction: 'desc'}],
    ...(documentIdParam
      ? {filter: '_id == $documentId', params: {documentId: documentIdParam}}
      : {}),
  })

  return {documentId: data[0]?.documentId, documentIdParam}
}

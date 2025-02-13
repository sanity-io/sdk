import {
  type DocumentHandle,
  getDocumentState,
  type JsonMatch,
  type JsonMatchPath,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @beta
 * ## useDocument(doc, path)
 * Read and subscribe to nested values in a document
 * @example
 * ```tsx
 * import {type DocumentHandle, useDocument} from '@sanity/sdk-react'
 *
 * function OrderLink({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const title = useDocument(documentHandle, 'title')
 *   const id = useDocument(documentHandle, '_id')
 *
 *   return (
 *     <a href=`/order/${id}`>Order {title} today!</a>
 *   )
 * }
 * ```
 *
 */
export function useDocument<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(doc: string | DocumentHandle<TDocument>, path: TPath): JsonMatch<TDocument, TPath> | undefined

/**
 * @beta
 * ## useDocument(doc)
 * Read and subscribe to an entire document
 * @example
 * ```tsx
 * import {type SanityDocument, type DocumentHandle, useDocument} from '@sanity/sdk-react'
 *
 * interface Book extends SanityDocument {
 *   title: string
 *   author: string
 *   summary: string
 * }
 *
 * function DocumentView({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const book = useDocument<Book>(documentHandle)
 *
 *   return (
 *     <article>
 *       <h1>{book?.title}</h1>
 *       <address>By {book?.author}</address>
 *
 *       <h2>Summary</h2>
 *       {book?.summary}
 *
 *       <h2>Order</h2>
 *       <a href=`/order/${book._id}`>Order {book?.title} today!</a>
 *     </article>
 *   )
 * }
 * ```
 *
 */
export function useDocument<TDocument extends SanityDocument>(
  doc: string | DocumentHandle<TDocument>,
): TDocument | null

/**
 * @beta
 * The `useDocument` hook enables reading and subscribing to a document’s state.
 * When called with a `path` argument, the hook will return the nested value’s state.
 * When called without a `path` argument, the entire document’s state will be returned.
 */
export function useDocument(doc: string | DocumentHandle, path?: string): unknown {
  const documentId = typeof doc === 'string' ? doc : doc._id
  const instance = useSanityInstance()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, documentId).getCurrent() !== undefined,
    [instance, documentId],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, documentId)

  const {subscribe, getCurrent} = useMemo(
    () => getDocumentState(instance, documentId, path),
    [documentId, instance, path],
  )

  return useSyncExternalStore(subscribe, getCurrent)
}

import {
  type DocumentHandle,
  getDocumentState,
  getResourceId,
  type JsonMatch,
  type JsonMatchPath,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 *
 * ## useDocument(doc, path)
 * Read and subscribe to nested values in a document
 * @category Documents
 * @param doc - The document to read state from. If you pass a `DocumentHandle` with a `resourceId` in the DocumentResourceId format (`document:projectId.dataset:documentId`)
 * the document will be read from the specified Sanity project and dataset that is included in the handle. If no `resourceId` is provided, the default project and dataset from your `SanityApp` configuration will be used.
 * @param path - The path to the nested value to read from
 * @returns The value at the specified path
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
>(doc: DocumentHandle<TDocument>, path: TPath): JsonMatch<TDocument, TPath> | undefined

/**
 * @public
 * ## useDocument(doc)
 * Read and subscribe to an entire document
 * @param doc - The document to read state from
 * @returns The document state as an object
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
  doc: DocumentHandle<TDocument>,
): TDocument | null

/**
 * @public
 * Reads and subscribes to a document’s realtime state, incorporating both local and remote changes.
 * When called with a `path` argument, the hook will return the nested value’s state.
 * When called without a `path` argument, the entire document’s state will be returned.
 *
 * @remarks
 * `useDocument` is designed to be used within a realtime context in which local updates to documents
 * need to be displayed before they are persisted to the remote copy. This can be useful within a collaborative
 * or realtime editing interface where local changes need to be reflected immediately.
 *
 * However, this hook can be too resource intensive for applications where static document values simply
 * need to be displayed (or when changes to documents don’t need to be reflected immediately);
 * consider using `usePreview` or `useQuery` for these use cases instead. These hooks leverage the Sanity
 * Live Content API to provide a more efficient way to read and subscribe to document state.
 */
export function useDocument(doc: DocumentHandle, path?: string): unknown {
  return _useDocument(doc, path)
}

const _useDocument = createStateSourceHook<[doc: DocumentHandle, path?: string], unknown>({
  getState: getDocumentState,
  shouldSuspend: (instance, doc) => getDocumentState(instance, doc._id).getCurrent() === undefined,
  suspender: resolveDocument,
  getResourceId: (doc) => getResourceId(doc.resourceId),
})

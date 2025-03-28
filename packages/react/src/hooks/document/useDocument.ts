import {
  type DocumentHandle,
  getDocumentState,
  type JsonMatch,
  type JsonMatchPath,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {identity} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @beta
 *
 * ## useDocument(doc, path)
 * Read and subscribe to nested values in a document
 * @category Documents
 * @param doc - The document to read state from, specified as a DocumentHandle
 * @param path - The path to the nested value to read from
 * @returns The value at the specified path
 * @example
 * ```tsx
 * import {useDocument} from '@sanity/sdk-react'
 *
 * const documentHandle = {
 *   documentId: 'order-123',
 *   documentType: 'order',
 *   projectId: 'abc123',
 *   dataset: 'production'
 * }
 *
 * function OrderLink() {
 *   const title = useDocument(documentHandle, 'title')
 *   const id = useDocument(documentHandle, '_id')
 *
 *   return (
 *     <a href={`/order/${id}`}>Order {title} today!</a>
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
 * @beta
 * ## useDocument(doc)
 * Read and subscribe to an entire document
 * @param doc - The document to read state from, specified as a DocumentHandle
 * @returns The document state as an object
 * @example
 * ```tsx
 * import {type SanityDocument, useDocument} from '@sanity/sdk-react'
 *
 * interface Book extends SanityDocument {
 *   title: string
 *   author: string
 *   summary: string
 * }
 *
 * const documentHandle = {
 *   documentId: 'book-123',
 *   documentType: 'book',
 *   projectId: 'abc123',
 *   dataset: 'production'
 * }
 *
 * function DocumentView() {
 *   const book = useDocument<Book>(documentHandle)
 *
 *   if (!book) {
 *     return <div>Loading...</div>
 *   }
 *
 *   return (
 *     <article>
 *       <h1>{book.title}</h1>
 *       <address>By {book.author}</address>
 *
 *       <h2>Summary</h2>
 *       {book.summary}
 *
 *       <h2>Order</h2>
 *       <a href={`/order/${book._id}`}>Order {book.title} today!</a>
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
 * @beta
 * Reads and subscribes to a document's realtime state, incorporating both local and remote changes.
 * When called with a `path` argument, the hook will return the nested value's state.
 * When called without a `path` argument, the entire document's state will be returned.
 *
 * @remarks
 * `useDocument` is designed to be used within a realtime context in which local updates to documents
 * need to be displayed before they are persisted to the remote copy. This can be useful within a collaborative
 * or realtime editing interface where local changes need to be reflected immediately.
 *
 * The hook automatically uses the correct Sanity instance based on the project and dataset
 * specified in the DocumentHandle. This makes it easy to work with documents from different
 * projects or datasets in the same component.
 *
 * However, this hook can be too resource intensive for applications where static document values simply
 * need to be displayed (or when changes to documents don't need to be reflected immediately);
 * consider using `usePreview` or `useQuery` for these use cases instead. These hooks leverage the Sanity
 * Live Content API to provide a more efficient way to read and subscribe to document state.
 */
export function useDocument(doc: DocumentHandle, path?: string): unknown {
  return _useDocument(doc, path)
}

const _useDocument = createStateSourceHook<[doc: DocumentHandle, path?: string], unknown>({
  getState: getDocumentState,
  shouldSuspend: (instance, doc) => getDocumentState(instance, doc).getCurrent() === undefined,
  suspender: resolveDocument,
  getConfig: identity,
})

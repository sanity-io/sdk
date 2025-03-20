import {
  type ActionsResult,
  type DocumentHandle,
  editDocument,
  getDocumentState,
  type JsonMatch,
  type JsonMatchPath,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyActions} from './useApplyActions'

const ignoredKeys = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

type Updater<TValue> = TValue | ((nextValue: TValue) => TValue)

/**
 *
 * @beta
 *
 * ## useEditDocument(doc, path)
 * Edit a nested value within a document
 *
 * @category Documents
 * @param docHandle - The document to be edited, specified as a DocumentHandle
 * @param path - The path to the nested value to be edited
 * @returns A function to update the nested value. Accepts either a new value, or an updater function that exposes the previous value and returns a new value.
 * @example Update a document's name by providing the new value directly
 * ```tsx
 * const handle = {
 *   documentId: 'movie-123',
 *   documentType: 'movie',
 *   projectId: 'abc123',
 *   dataset: 'production'
 * }
 *
 * const name = useDocument(handle, 'name')
 * const editName = useEditDocument(handle, 'name')
 *
 * function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
 *   editName(event.target.value)
 * }
 *
 * return (
 *   <input type='text' value={name} onChange={handleNameChange} />
 * )
 * ```
 *
 * @example Update a count on a document by providing an updater function
 * ```tsx
 * const handle = {
 *   documentId: 'counter-123',
 *   documentType: 'counter',
 *   projectId: 'abc123',
 *   dataset: 'production'
 * }
 *
 * const count = useDocument(handle, 'count')
 * const editCount = useEditDocument(handle, 'count')
 *
 * function incrementCount() {
 *   editCount(previousCount => previousCount + 1)
 * }
 *
 * return (
 *   <>
 *     <button onClick={incrementCount}>
 *       Increment
 *     </button>
 *     Current count: {count}
 *   </>
 * )
 * ```
 */
export function useEditDocument<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(
  docHandle: DocumentHandle<TDocument>,
  path: TPath,
): (nextValue: Updater<JsonMatch<TDocument, TPath>>) => Promise<ActionsResult<TDocument>>

/**
 *
 * @beta
 *
 * ## useEditDocument(doc)
 * Edit an entire document
 * @param docHandle - The document to be edited, specified as a DocumentHandle.
 * The hook will automatically use the Sanity instance that matches the project and dataset specified in the handle.
 * @returns A function to update the document state. Accepts either a new document state, or an updater function that exposes the previous document state and returns the new document state.
 * @example
 * ```tsx
 * const myDocumentHandle = {
 *   documentId: 'product-123',
 *   documentType: 'product',
 *   projectId: 'abc123',
 *   dataset: 'production'
 * }
 *
 * const myDocument = useDocument(myDocumentHandle)
 * const { title, price } = myDocument ?? {}
 *
 * const editMyDocument = useEditDocument(myDocumentHandle)
 *
 * function handleFieldChange(e: React.ChangeEvent<HTMLInputElement>) {
 *   const {name, value} = e.currentTarget
 *   // Use an updater function to update the document state based on the previous state
 *   editMyDocument(previousDocument => ({
 *     ...previousDocument,
 *     [name]: value
 *   }))
 * }
 *
 * function handleSaleChange(e: React.ChangeEvent<HTMLInputElement>) {
 *   const { checked } = e.currentTarget
 *   if (checked) {
 *     // Use an updater function to add a new salePrice field;
 *     // set it at a 20% discount off the normal price
 *     editMyDocument(previousDocument => ({
 *       ...previousDocument,
 *       salePrice: previousDocument.price * 0.8,
 *     }))
 *   } else {
 *     // Get the document state without the salePrice field
 *     const { salePrice, ...rest } = myDocument
 *     // Update the document state to remove the salePrice field
 *     editMyDocument(rest)
 *   }
 * }
 *
 * return (
 *   <>
 *     <form onSubmit={e => e.preventDefault()}>
 *       <input name='title' type='text' value={title} onChange={handleFieldChange} />
 *       <input name='price' type='number' value={price} onChange={handleFieldChange} />
 *       <input
 *         name='salePrice'
 *         type='checkbox'
 *         checked={myDocument && 'salePrice' in myDocument}
 *         onChange={handleSaleChange}
 *       />
 *     </form>
 *     <pre><code>
 *       {JSON.stringify(myDocument, null, 2)}
 *     </code></pre>
 *   </>
 * )
 * ```
 */
export function useEditDocument<TDocument extends SanityDocument>(
  docHandle: DocumentHandle<TDocument>,
): (nextValue: Updater<TDocument>) => Promise<ActionsResult<TDocument>>

/**
 *
 * @beta
 *
 * Enables editing of a document’s state.
 * When called with a `path` argument, the hook will return a function for updating a nested value.
 * When called without a `path` argument, the hook will return a function for updating the entire document.
 */
export function useEditDocument(
  docHandle: DocumentHandle,
  path?: string,
): (updater: Updater<unknown>) => Promise<ActionsResult> {
  const instance = useSanityInstance(docHandle)
  const apply = useApplyActions()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, docHandle).getCurrent() !== undefined,
    [instance, docHandle],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, docHandle)

  return (updater: Updater<unknown>) => {
    if (path) {
      const nextValue =
        typeof updater === 'function'
          ? updater(getDocumentState(instance, docHandle, path).getCurrent())
          : updater

      return apply(editDocument(docHandle, {set: {[path]: nextValue}}))
    }

    const current = getDocumentState(instance, docHandle).getCurrent() as object | null | undefined
    const nextValue = typeof updater === 'function' ? updater(current) : updater

    if (typeof nextValue !== 'object' || !nextValue) {
      throw new Error(
        `No path was provided to \`useEditDocument\` and the value provided was not a document object.`,
      )
    }

    const allKeys = Object.keys({...current, ...nextValue})
    const editActions = allKeys
      .filter((key) => !ignoredKeys.includes(key))
      .filter((key) => current?.[key as keyof typeof current] !== nextValue[key])
      .map((key) =>
        key in nextValue
          ? editDocument(docHandle, {set: {[key]: nextValue[key]}})
          : editDocument(docHandle, {unset: [key]}),
      )

    return apply(editActions)
  }
}

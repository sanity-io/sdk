import {
  type ActionsResult,
  type DocumentOptions,
  editDocument,
  getDocumentState,
  type JsonMatch,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from 'groq'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedSourceOptions} from '../helpers/useNormalizedSourceOptions'
import {useApplyDocumentActions} from './useApplyDocumentActions'

const ignoredKeys = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

type Updater<TValue> = TValue | ((currentValue: TValue) => TValue)

// Overload 1: No path, relies on Typegen
/**
 * @public
 * Edit an entire document, relying on Typegen for the type.
 *
 * @param options - Document options including `documentId`, `documentType`, and optionally `projectId`/`dataset`.
 * @returns A stable function to update the document state. Accepts either the new document state or an updater function `(currentValue) => nextValue`.
 *          Returns a promise resolving to the {@link ActionsResult}.
 */
export function useEditDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: DocumentOptions<undefined, TDocumentType, TDataset, TProjectId>,
): (
  nextValue: Updater<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>>,
) => Promise<ActionsResult<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>>>

// Overload 2: Path provided, relies on Typegen
/**
 * @public
 * Edit a specific path within a document, relying on Typegen for the type.
 *
 * @param options - Document options including `documentId`, `documentType`, `path`, and optionally `projectId`/`dataset`.
 * @returns A stable function to update the value at the specified path. Accepts either the new value or an updater function `(currentValue) => nextValue`.
 *          Returns a promise resolving to the {@link ActionsResult}.
 */
export function useEditDocument<
  TPath extends string = string,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: DocumentOptions<TPath, TDocumentType, TDataset, TProjectId>,
): (
  nextValue: Updater<JsonMatch<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>, TPath>>,
) => Promise<ActionsResult<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>>>

// Overload 3: Explicit type, no path
/**
 * @public
 * Edit an entire document with an explicit type `TData`.
 *
 * @param options - Document options including `documentId` and optionally `projectId`/`dataset`.
 * @returns A stable function to update the document state. Accepts either the new document state (`TData`) or an updater function `(currentValue: TData) => nextValue: TData`.
 *          Returns a promise resolving to the {@link ActionsResult}.
 */
export function useEditDocument<TData>(
  options: DocumentOptions<undefined>,
): (nextValue: Updater<TData>) => Promise<ActionsResult>

// Overload 4: Explicit type, path provided
/**
 * @public
 * Edit a specific path within a document with an explicit type `TData`.
 *
 * @param options - Document options including `documentId`, `path`, and optionally `projectId`/`dataset`.
 * @returns A stable function to update the value at the specified path. Accepts either the new value (`TData`) or an updater function `(currentValue: TData) => nextValue: TData`.
 *          Returns a promise resolving to the {@link ActionsResult}.
 */
export function useEditDocument<TData>(
  options: DocumentOptions<string>,
): (nextValue: Updater<TData>) => Promise<ActionsResult>

/**
 * @public
 * Provides a stable function to apply edits to a document or a specific path within it.
 *
 * @category Documents
 * @remarks
 * This hook simplifies editing documents by automatically:
 * - Comparing the current and next states to determine the minimal set of `set` and `unset` operations required for the update via `editDocument`.
 * - Handling both full document updates and specific path updates.
 * - Supporting functional updates (e.g., `edit(prev => ({...prev, title: 'New'}))`).
 * - Integrating with the active {@link SanityInstance} context.
 * - Utilizing `useApplyDocumentActions` internally for optimistic updates and transaction handling.
 *
 * It offers several overloads for flexibility:
 * 1. **Typegen (Full Document):** Edit the entire document, inferring types from your schema.
 * 2. **Typegen (Specific Path):** Edit a specific field, inferring types.
 * 3. **Explicit Type (Full Document):** Edit the entire document with a manually specified type.
 * 4. **Explicit Type (Specific Path):** Edit a specific field with a manually specified type.
 *
 * **LiveEdit Documents:**
 * For documents using {@link DocumentHandle.liveEdit | liveEdit mode} (set via `liveEdit: true` in the document handle), edits are applied directly to the published document without creating a draft.
 *
 * This hook relies on the document state being loaded. If the document is not yet available
 * (e.g., during initial load), the component using this hook will suspend.
 *
 * @example Basic Usage (Typegen, Full Document)
 * ```tsx
 * import {useCallback} from 'react';
 * import {useEditDocument, useDocument, type DocumentHandle} from '@sanity/sdk-react'
 *
 * // Assume 'product' schema has a 'title' field (string)
 * interface ProductEditorProps {
 *   productHandle: DocumentHandle<'product'> // Typegen infers 'product' type
 * }
 *
 * function ProductEditor({ productHandle }: ProductEditorProps) {
 *   // Fetch the document to display its current state (optional)
 *   const {data: product} = useDocument(productHandle);
 *   // Get the edit function for the full document
 *   const editProduct = useEditDocument(productHandle);
 *
 *   // Use useCallback for stable event handlers
 *   const handleTitleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
 *     const newTitle = event.target.value;
 *     // Use the functional updater for safe partial updates
 *     editProduct(prev => ({
 *       ...prev,
 *       title: newTitle,
 *     })).
 *   }, [editProduct]);
 *
 *   return (
 *     <div>
 *       <label>
 *         Product Title:
 *         <input
 *           type="text"
 *           value={product?.title ?? ''}
 *           onChange={handleTitleChange}
 *         />
 *       </label>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Editing a Specific Path (Typegen)
 * ```tsx
 * import React, { useCallback } from 'react';
 * import {useEditDocument, useDocument, type DocumentHandle, type DocumentOptions} from '@sanity/sdk-react'
 *
 * // Assume 'product' schema has a 'price' field (number)
 * interface ProductPriceEditorProps {
 *   productHandle: DocumentHandle<'product'>;
 * }
 *
 * function ProductPriceEditor({ productHandle }: ProductPriceEditorProps) {
 *   // Construct DocumentOptions internally, combining the handle and a hardcoded path
 *   const priceOptions {
 *     ...productHandle,
 *     path: 'price', // Hardcode the path to edit
 *   };
 *
 *   // Fetch the current price to display it
 *   const {data: currentPrice} = useDocument(priceOptions);
 *   // Get the edit function for the specific path 'price'
 *   const editPrice = useEditDocument(priceOptions);
 *
 *   const handleSetFixedPrice = useCallback(() => {
 *     // Update the price directly to a hardcoded value
 *     editPrice(99.99)
 *   }, [editPrice]);
 *
 *   return (
 *     <div>
 *       <p>Current Price: {currentPrice}</p>
 *       <button onClick={handleSetFixedPrice}>
 *         Set Price to $99.99
 *       </button>
 *     </div>
 *   );
 * }
 *
 * ```
 *
 * @example Usage with Explicit Types (Full Document)
 * ```tsx
 * import React, { useCallback } from 'react';
 * import {useEditDocument, useDocument, type DocumentHandle, type SanityDocument} from '@sanity/sdk-react'
 *
 * interface Book extends SanityDocument { _type: 'book', title: string, author: string }
 *
 * interface BookEditorProps {
 *   bookHandle: DocumentHandle // No documentType needed if providing TData
 * }
 *
 * function BookEditor({ bookHandle }: BookEditorProps) {
 *   const {data: book} = useDocument<Book>(bookHandle);
 *   // Provide the explicit type <Book>
 *   const editBook = useEditDocument<Book>(bookHandle);
 *
 *   const handleAuthorChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
 *     const newAuthor = event.target.value;
 *     editBook(prev => ({
 *       ...prev,
 *       author: newAuthor
 *     }))
 *   }, [editBook]);
 *
 *   return (
 *      <div>
 *       <label>
 *         Book Author:
 *         <input
 *           type="text"
 *           value={book?.author ?? ''}
 *           onChange={handleAuthorChange}
 *         />
 *       </label>
 *     </div>
 *   );
 * }
 *
 * ```
 *
 * @example Usage with Explicit Types (Specific Path)
 * ```tsx
 * import React, { useCallback } from 'react';
 * import {useEditDocument, useDocument, type DocumentHandle, type DocumentOptions} from '@sanity/sdk-react'
 *
 * // Assume 'book' has 'author.name' (string)
 * interface AuthorNameEditorProps {
 *   bookHandle: DocumentHandle; // No documentType needed if providing TData for path
 * }
 *
 * function AuthorNameEditor({ bookHandle }: AuthorNameEditorProps) {*
 *   // Fetch current value
 *   const {data: currentName} = useDocument<string>({...bookHandle, path: 'author.name'});
 *   // Provide the explicit type <string> for the path's value
 *   const editAuthorName = useEditDocument<string>({...bookHandle, path: 'author.name'});
 *
 *   const handleUpdate = useCallback(() => {
 *     // Update with a hardcoded string directly
 *     editAuthorName('Jane Doe')
 *   }, [editAuthorName]);
 *
 *   return (
 *     <div>
 *       <p>Current Author Name: {currentName}</p>
 *       <button onClick={handleUpdate} disabled={currentName === undefined}>
 *         Set Author Name to Jane Doe
 *       </button>
 *     </div>
 *   );
 * }
 *
 * ```
 */
export function useEditDocument({
  path,
  ...doc
}: DocumentOptions<string | undefined>): (updater: Updater<unknown>) => Promise<ActionsResult> {
  const instance = useSanityInstance(doc)
  const normalizedDoc = useNormalizedSourceOptions(doc)

  const apply = useApplyDocumentActions()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, normalizedDoc).getCurrent() !== undefined,
    [instance, normalizedDoc],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, normalizedDoc)

  return (updater: Updater<unknown>) => {
    const currentPath = path

    if (currentPath) {
      const stateWithOptions = getDocumentState(instance, {...normalizedDoc, path})
      const currentValue = stateWithOptions.getCurrent()

      const nextValue =
        typeof updater === 'function'
          ? (updater as (prev: typeof currentValue) => typeof currentValue)(currentValue)
          : updater

      return apply(editDocument(normalizedDoc, {set: {[currentPath]: nextValue}}))
    }

    const fullDocState = getDocumentState(instance, {...normalizedDoc, path})
    const current = fullDocState.getCurrent() as object | null | undefined
    const nextValue =
      typeof updater === 'function'
        ? (updater as (prev: typeof current) => typeof current)(current)
        : updater

    if (typeof nextValue !== 'object' || !nextValue) {
      throw new Error(
        `No path was provided to \`useEditDocument\` and the value provided was not a document object.`,
      )
    }

    const allKeys = Object.keys({...current, ...nextValue})
    const editActions = allKeys
      .filter((key) => !ignoredKeys.includes(key))
      .filter(
        (key) =>
          current?.[key as keyof typeof current] !== (nextValue as Record<string, unknown>)[key],
      )
      .map((key) =>
        key in nextValue
          ? editDocument(normalizedDoc, {set: {[key]: (nextValue as Record<string, unknown>)[key]}})
          : editDocument(normalizedDoc, {unset: [key]}),
      )

    return apply(editActions)
  }
}

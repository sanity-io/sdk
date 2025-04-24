import {
  type ActionsResult,
  type DocumentOptions,
  editDocument,
  getDocumentState,
  type JsonMatch,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocumentResult} from 'groq'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyDocumentActions} from './useApplyDocumentActions'

const ignoredKeys = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

type Updater<TValue> = TValue | ((currentValue: TValue) => TValue)

// Overload 1: No path, relies on Typegen
/**
 * @beta
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
  nextValue: Updater<SanityDocumentResult<TDocumentType, TDataset, TProjectId>>,
) => Promise<ActionsResult<SanityDocumentResult<TDocumentType, TDataset, TProjectId>>>

// Overload 2: Path provided, relies on Typegen
/**
 * @beta
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
  nextValue: Updater<JsonMatch<SanityDocumentResult<TDocumentType, TDataset, TProjectId>, TPath>>,
) => Promise<ActionsResult<SanityDocumentResult<TDocumentType, TDataset, TProjectId>>>

// Overload 3: Explicit type, no path
/**
 * @beta
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
 * @beta
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
 * @beta
 * Provides a stable function to apply edits to a document or a specific path within it.
 *
 * @category Documents
 * @remarks
 * This hook simplifies editing documents by automatically:
 * - Determining the necessary `editDocument` actions based on the changes provided.
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
 * This hook relies on the document state being loaded. If the document is not yet available
 * (e.g., during initial load), the component using this hook will suspend.
 *
 * @example Basic Usage (Typegen, Full Document)
 * ```tsx
 * import {useEditDocument, type DocumentHandle} from '@sanity/sdk-react'
 *
 * interface ProductEditorProps {
 *   doc: DocumentHandle<'product'> // Typegen infers 'product' type
 * }
 *
 * function ProductEditor({doc}: ProductEditorProps) {
 *   // Pass the document handle directly
 *   const editProduct = useEditDocument(doc)
 *
 *   const handleTitleUpdate = (newTitle: string) => {
 *     // Use the functional updater for safe partial updates
 *     editProduct(prev => ({
 *       ...prev,
 *       title: newTitle,
 *     }))
 *   }
 *
 *   // ... render input and call handleTitleUpdate
 * }
 * ```
 *
 * @example Editing a Specific Path (Typegen)
 * ```tsx
 * import {useEditDocument, type DocumentOptions} from '@sanity/sdk-react'
 *
 * interface PriceEditorProps {
 *   // Use DocumentOptions when specifying a path
 *   doc: DocumentOptions<'price', 'product'>
 * }
 *
 * function PriceEditor({doc}: PriceEditorProps) {
 *   // Pass the DocumentOptions including the path
 *   const editPrice = useEditDocument(doc)
 *
 *   const handleUpdate = (newPrice: number) => {
 *     // Pass the new value directly when editing a specific path
 *     editPrice(newPrice)
 *   }
 *
 *   // ... render input and call handleUpdate
 * }
 * ```
 *
 * @example Usage with Explicit Types (Full Document)
 * ```tsx
 * import {useEditDocument, type DocumentHandle, type SanityDocument} from '@sanity/sdk-react'
 *
 * interface Book extends SanityDocument { _type: 'book', title: string, author: string }
 *
 * interface BookEditorProps {
 *   doc: DocumentHandle // No documentType needed if providing TData
 * }
 *
 * function BookEditor({doc}: BookEditorProps) {
 *   const editBook = useEditDocument<Book>(doc)
 *
 *   const handleAuthorUpdate = (newAuthor: string) => {
 *     editBook(prev => ({ ...prev, author: newAuthor }))
 *   }
 *
 *   // ... render input and call handleAuthorUpdate
 * }
 * ```
 */
export function useEditDocument({
  path,
  ...doc
}: DocumentOptions<string | undefined>): (updater: Updater<unknown>) => Promise<ActionsResult> {
  const instance = useSanityInstance(doc)
  const apply = useApplyDocumentActions()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, doc).getCurrent() !== undefined,
    [instance, doc],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, doc)

  return (updater: Updater<unknown>) => {
    const currentPath = path

    if (currentPath) {
      const stateWithOptions = getDocumentState(instance, {...doc, path})
      const currentValue = stateWithOptions.getCurrent()

      const nextValue =
        typeof updater === 'function'
          ? (updater as (prev: typeof currentValue) => typeof currentValue)(currentValue)
          : updater

      return apply(editDocument(doc, {set: {[currentPath]: nextValue}}))
    }

    const fullDocState = getDocumentState(instance, {...doc, path})
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
          ? editDocument(doc, {set: {[key]: (nextValue as Record<string, unknown>)[key]}})
          : editDocument(doc, {unset: [key]}),
      )

    return apply(editActions)
  }
}

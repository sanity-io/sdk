import {createDocument} from '@sanity/sdk'
import {type SanityDocument} from 'groq'

import {type DocumentHandle, type DocumentTypeHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {trackHookUsage} from '../helpers/useTrackHookUsage'
import {useApplyDocumentActions} from './useApplyDocumentActions'

type IgnoredKey = '_id' | '_type' | '_rev' | '_createdAt' | '_updatedAt'

/**
 * Optional per-call overrides for {@link useCreateDocument}'s create function.
 * @public
 */
export interface CreateDocumentOverrides {
  /**
   * Use this document ID instead of generating one. Overrides any `documentId`
   * supplied on the handle passed to `useCreateDocument`.
   */
  documentId?: string
}

// Overload 1: Typegen — infers the document shape from your schema.
/**
 * @public
 * Create a new document, relying on Typegen for the initial-value type.
 *
 * @param options - A document-type handle including `documentType`, an optional `documentId`, and optionally `projectId`/`dataset`/`perspective`.
 * @returns A function that creates the document. It accepts optional initial field values and an optional `{documentId}` override,
 *          and resolves to the {@link DocumentHandle} of the created document (carrying the generated or supplied id).
 */
export function useCreateDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: DocumentTypeHandle<TDocumentType, TDataset, TProjectId>,
): (
  initialValue?: Partial<
    Omit<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>, IgnoredKey>
  >,
  overrides?: CreateDocumentOverrides,
) => Promise<DocumentHandle<TDocumentType, TDataset, TProjectId>>

// Overload 2: Explicit type `TData`.
/**
 * @public
 * Create a new document with an explicit type `TData`.
 *
 * @param options - A document-type handle including `documentType` and optionally `projectId`/`dataset`/`perspective`.
 * @returns A function that creates the document. It accepts optional initial field values (typed against `TData`) and an
 *          optional `{documentId}` override, and resolves to the {@link DocumentHandle} of the created document.
 */
export function useCreateDocument<TData extends Record<string, unknown>>(
  options: DocumentTypeHandle,
): (
  initialValue?: Partial<Omit<TData, IgnoredKey>>,
  overrides?: CreateDocumentOverrides,
) => Promise<DocumentHandle>

/**
 * @public
 * Provides a function to create a new document and returns its handle.
 *
 * @category Documents
 * @remarks
 * This is the create counterpart to {@link useEditDocument}. It wraps
 * {@link useApplyDocumentActions} and the `createDocument` action for the common
 * single-document case, so you don't have to assemble the action by hand.
 *
 * It handles the document ID for you: if you don't supply one (on the handle or
 * via the per-call `{documentId}` override), a UUID is generated. Either way the
 * returned {@link DocumentHandle} carries that id, ready to pass to
 * {@link useDocument}, {@link useEditDocument}, or your router.
 *
 * Unlike {@link useEditDocument}, this hook does not read existing document state,
 * so it never suspends.
 *
 * For atomic create-and-publish, or for creating several documents in a single
 * transaction, use {@link useApplyDocumentActions} with the `createDocument` and
 * `publishDocument` action creators directly.
 *
 * @example Create a document and navigate to it
 * ```tsx
 * import {useCreateDocument} from '@sanity/sdk-react'
 * import {useNavigate} from 'react-router-dom'
 *
 * function CreateArticleButton() {
 *   const createArticle = useCreateDocument({documentType: 'article'})
 *   const navigate = useNavigate()
 *
 *   const handleClick = async () => {
 *     const handle = await createArticle({title: 'New Article'})
 *     navigate(`/articles/${handle.documentId}`)
 *   }
 *
 *   return <button onClick={handleClick}>Create Article</button>
 * }
 * ```
 */
export function useCreateDocument(
  options: DocumentTypeHandle,
): (
  initialValue?: Record<string, unknown>,
  overrides?: CreateDocumentOverrides,
) => Promise<DocumentHandle> {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useCreateDocument')
  const apply = useApplyDocumentActions()

  return async (initialValue, overrides) => {
    const documentId = overrides?.documentId ?? options.documentId ?? crypto.randomUUID()
    const handle: DocumentHandle = {...options, documentId}
    await apply(createDocument(handle, initialValue))
    return handle
  }
}

import {
  type ActionsResult,
  applyDocumentActions,
  type ApplyDocumentActionsOptions,
  type DocumentAction,
  type ResourceId,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 *
 * @beta
 *
 * Provides a callback for applying one or more actions to a document.
 *
 * @category Documents
 * @param resourceId - The resource ID of the document to apply actions to. If not provided, the document will use the default resource.
 * @returns A function that takes one more more {@link DocumentAction}s and returns a promise that resolves to an {@link ActionsResult}.
 * @example Publish or unpublish a document
 * ```
 * import { publishDocument, unpublishDocument } from '@sanity/sdk'
 * import { useApplyDocumentActions } from '@sanity/sdk-react'
 *
 * const apply = useApplyDocumentActions()
 * const myDocument = { _id: 'my-document-id', _type: 'my-document-type' }
 *
 * return (
 *   <button onClick={() => apply(publishDocument(myDocument))}>Publish</button>
 *   <button onClick={() => apply(unpublishDocument(myDocument))}>Unpublish</button>
 * )
 * ```
 *
 * @example Create and publish a new document
 * ```
 * import { createDocument, publishDocument } from '@sanity/sdk'
 * import { useApplyDocumentActions } from '@sanity/sdk-react'
 *
 * const apply = useApplyDocumentActions()
 *
 * const handleCreateAndPublish = () => {
 *   const handle = { _id: window.crypto.randomUUID(), _type: 'my-document-type' }
 *   apply([
 *     createDocument(handle),
 *     publishDocument(handle),
 *   ])
 * }
 *
 * return (
 *   <button onClick={handleCreateAndPublish}>
 *     I’m feeling lucky
 *   </button>
 * )
 * ```
 */
export function useApplyDocumentActions(
  resourceId?: ResourceId,
): <TDocument extends SanityDocument>(
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyDocumentActionsOptions,
) => Promise<ActionsResult<TDocument>>

/** @beta */
export function useApplyDocumentActions(
  resourceId?: ResourceId,
): (
  action: DocumentAction | DocumentAction[],
  options?: ApplyDocumentActionsOptions,
) => Promise<ActionsResult> {
  return _useApplyDocumentActions(resourceId)()
}

const _useApplyDocumentActions = (resourceId?: ResourceId) =>
  createCallbackHook(applyDocumentActions, resourceId)

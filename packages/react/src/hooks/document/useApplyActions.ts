import {
  type ActionsResult,
  applyActions,
  type ApplyActionsOptions,
  type DocumentAction,
  type ResourceId,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 *
 * @public
 *
 * Provides a callback for applying one or more actions to a document.
 *
 * @category Documents
 * @param resourceId - The resource ID of the document to apply actions to. If not provided, the document will use the default resource.
 * @returns A function that takes one more more {@link DocumentAction}s and returns a promise that resolves to an {@link ActionsResult}.
 * @example Publish or unpublish a document
 * ```
 * import { publishDocument, unpublishDocument } from '@sanity/sdk'
 * import { useApplyActions } from '@sanity/sdk-react'
 *
 * const apply = useApplyActions()
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
 * import { useApplyActions } from '@sanity/sdk-react'
 *
 * const apply = useApplyActions()
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
export function useApplyActions(
  resourceId?: ResourceId,
): <TDocument extends SanityDocument>(
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult<TDocument>>

/** @public */
export function useApplyActions(
  resourceId?: ResourceId,
): (
  action: DocumentAction | DocumentAction[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult> {
  return _useApplyActions(resourceId)()
}

const _useApplyActions = (resourceId?: ResourceId) => createCallbackHook(applyActions, resourceId)

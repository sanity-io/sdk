import {
  type ActionsResult,
  applyActions,
  type ApplyActionsOptions,
  type DocumentAction,
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
export function useApplyActions(): <TDocument extends SanityDocument>(
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult<TDocument>>

/** @beta */
export function useApplyActions(): (
  action: DocumentAction | DocumentAction[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult> {
  return _useApplyActions()
}

const _useApplyActions = createCallbackHook(applyActions)

import {
  type ActionsResult,
  type ApplyActionsOptions,
  type DatasetResourceId,
  type DocumentAction,
  getDocumentStore,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 *
 * @beta
 *
 * Provides a callback for applying one or more actions to a document.
 *
 * @param datasetResourceId - Optional dataset resource ID to target a specific dataset
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
 *     I'm feeling lucky
 *   </button>
 * )
 * ```
 */
export function useApplyActions(
  datasetResourceId: DatasetResourceId,
): <TDocument extends SanityDocument>(
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult<TDocument>>

/** @beta */
export function useApplyActions(
  datasetResourceId: DatasetResourceId,
): (
  action: DocumentAction | DocumentAction[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult> {
  const instance = useSanityInstance()
  const store = getDocumentStore(instance, datasetResourceId)
  return _useApplyActions(store.applyActions)
}

const _useApplyActions =
  (
    applyActions: (
      action: DocumentAction | DocumentAction[],
      options?: ApplyActionsOptions,
    ) => Promise<ActionsResult>,
  ) =>
  (action: DocumentAction | DocumentAction[], options?: ApplyActionsOptions) =>
    applyActions(action, options)

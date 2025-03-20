import {applyActions} from '@sanity/sdk'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 *
 * @beta
 *
 * Provides a callback for applying one or more actions to a document.
 *
 * @category Documents
 * @param dataset - An optional dataset handle with projectId and dataset. If not provided, the nearest SanityInstance from context will be used.
 * @returns A function that takes one more more {@link DocumentAction}s and returns a promise that resolves to an {@link ActionsResult}.
 * @example Publish or unpublish a document
 * ```
 * import { publishDocument, unpublishDocument } from '@sanity/sdk'
 * import { useApplyActions } from '@sanity/sdk-react'
 *
 * const apply = useApplyActions()
 * const myDocument = { documentId: 'my-document-id', documentType: 'my-document-type' }
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
 *   const handle = { documentId: window.crypto.randomUUID(), documentType: 'my-document-type' }
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
export const useApplyActions = createCallbackHook(applyActions)

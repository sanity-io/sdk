import {type DocumentAction, type DocumentPermissionsResult, getPermissionsState} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 *
 * @public
 *
 * Check if the current user has the specified permissions for the given document actions.
 *
 * @category Permissions
 * @param actionOrActions - One or more document action functions (e.g., `publishDocument(handle)`).
 * @returns An object that specifies whether the action is allowed; if the action is not allowed, an explanatory message and list of reasons is also provided.
 *
 * @remarks
 * When passing multiple actions, all actions must belong to the same project and dataset.
 * Note, however, that you can check permissions on multiple documents from the same project and dataset (as in the second example below).
 *
 * @example Checking for permission to publish a document
 * ```tsx
 * import {
 *   useDocumentPermissions,
 *   useApplyDocumentActions,
 *   publishDocument,
 *   createDocumentHandle,
 *   type DocumentHandle
 * } from '@sanity/sdk-react'
 *
 * // Define props using the DocumentHandle type
 * interface PublishButtonProps {
 *   doc: DocumentHandle
 * }
 *
 * function PublishButton({doc}: PublishButtonProps) {
 *   const publishAction = publishDocument(doc)
 *
 *   // Pass the same action call to check permissions
 *   const publishPermissions = useDocumentPermissions(publishAction)
 *   const apply = useApplyDocumentActions()
 *
 *   return (
 *     <>
 *       <button
 *         disabled={!publishPermissions.allowed}
 *         // Pass the same action call to apply the action
 *         onClick={() => apply(publishAction)}
 *         popoverTarget={`${publishPermissions.allowed ? undefined : 'publishButtonPopover'}`}
 *       >
 *         Publish
 *       </button>
 *       {!publishPermissions.allowed && (
 *         <div popover id="publishButtonPopover">
 *           {publishPermissions.message}
 *         </div>
 *       )}
 *     </>
 *   )
 * }
 *
 * // Usage:
 * // const doc = createDocumentHandle({ documentId: 'doc1', documentType: 'myType' })
 * // <PublishButton doc={doc} />
 * ```
 *
 * @example Checking for permissions to edit multiple documents
 * ```tsx
 * import {
 *   useDocumentPermissions,
 *   editDocument,
 *   type DocumentHandle
 * } from '@sanity/sdk-react'
 *
 * export default function canEditMultiple(docHandles: DocumentHandle[]) {
 *   // Create an array containing an editDocument action for each of the document handles
 *   const editActions = docHandles.map(doc => editDocument(doc))
 *
 *   // Return the result of checking for edit permissions on all of the document handles
 *   return useDocumentPermissions(editActions)
 * }
 * ```
 */
export function useDocumentPermissions(
  actionOrActions: DocumentAction | DocumentAction[],
): DocumentPermissionsResult {
  const actions = useMemo(
    () => (Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions]),
    [actionOrActions],
  )
  // if actions is an array, we need to check that all actions belong to the same project and dataset
  let projectId
  let dataset

  for (const action of actions) {
    if (action.projectId) {
      if (!projectId) projectId = action.projectId
      if (action.projectId !== projectId) {
        throw new Error(
          `Mismatched project IDs found in actions. All actions must belong to the same project. Found "${action.projectId}" but expected "${projectId}".`,
        )
      }

      if (action.dataset) {
        if (!dataset) dataset = action.dataset
        if (action.dataset !== dataset) {
          throw new Error(
            `Mismatched datasets found in actions. All actions must belong to the same dataset. Found "${action.dataset}" but expected "${dataset}".`,
          )
        }
      }
    }
  }

  const instance = useSanityInstance({projectId, dataset})
  const isDocumentReady = useCallback(
    () => getPermissionsState(instance, {actions}).getCurrent() !== undefined,
    [actions, instance],
  )
  if (!isDocumentReady()) {
    throw firstValueFrom(
      getPermissionsState(instance, {actions}).observable.pipe(
        filter((result) => result !== undefined),
      ),
    )
  }

  const {subscribe, getCurrent} = useMemo(
    () => getPermissionsState(instance, {actions}),
    [actions, instance],
  )

  return useSyncExternalStore(subscribe, getCurrent) as DocumentPermissionsResult
}

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
 * @param actionOrActions - One more more calls to a particular document action function for a given document
 * @returns An object that specifies whether the action is allowed; if the action is not allowed, an explanatory message and list of reasons is also provided.
 *
 * @example Checking for permission to publish a document
 * ```ts
 * import {useDocumentPermissions, useApplyDocumentActions} from '@sanity/sdk-react'
 * import {publishDocument} from '@sanity/sdk'
 *
 * export function PublishButton({doc}: {doc: DocumentHandle}) {
 *   const publishPermissions = useDocumentPermissions(publishDocument(doc))
 *   const applyAction = useApplyDocumentActions()
 *
 *   return (
 *     <>
 *       <button
 *         disabled={!publishPermissions.allowed}
 *         onClick={() => applyAction(publishDocument(doc))}
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
 * ```
 */
export function useDocumentPermissions(
  actionOrActions: DocumentAction | DocumentAction[],
): DocumentPermissionsResult {
  const actions = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions]
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
    () => getPermissionsState(instance, actionOrActions).getCurrent() !== undefined,
    [actionOrActions, instance],
  )
  if (!isDocumentReady()) {
    throw firstValueFrom(
      getPermissionsState(instance, actionOrActions).observable.pipe(
        filter((result) => result !== undefined),
      ),
    )
  }

  const {subscribe, getCurrent} = useMemo(
    () => getPermissionsState(instance, actionOrActions),
    [actionOrActions, instance],
  )

  return useSyncExternalStore(subscribe, getCurrent) as DocumentPermissionsResult
}

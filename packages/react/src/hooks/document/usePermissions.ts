import {
  type DocumentAction,
  getPermissionsState,
  getResourceId,
  type PermissionsResult,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 *
 * @beta
 *
 * Check if the current user has the specified permissions for the given document actions.
 *
 * @category Permissions
 * @param actions - One more more calls to a particular document action function for a given document
 * @returns An object that specifies whether the action is allowed; if the action is not allowed, an explanatory message and list of reasons is also provided.
 *
 * @example Checking for permission to publish a document
 * ```ts
 * import {usePermissions, useApplyActions} from '@sanity/sdk-react'
 * import {publishDocument} from '@sanity/sdk'
 *
 * export function PublishButton({doc}: {doc: DocumentHandle}) {
 *   const canPublish = usePermissions(publishDocument(doc))
 *   const applyAction = useApplyActions()
 *
 *   return (
 *     <>
 *       <button
 *         disabled={!canPublish.allowed}
 *         onClick={() => applyAction(publishDocument(doc))}
 *         popoverTarget={`${canPublish.allowed ? undefined : 'publishButtonPopover'}`}
 *       >
 *         Publish
 *       </button>
 *       {!canPublish.allowed && (
 *         <div popover id="publishButtonPopover">
 *           {canPublish.message}
 *         </div>
 *       )}
 *     </>
 *   )
 * }
 * ```
 */
export function usePermissions(actions: DocumentAction | DocumentAction[]): PermissionsResult {
  // if actions is an array, we need to check each action to see if the resourceId is the same
  if (Array.isArray(actions)) {
    const resourceIds = actions.map((action) => action.resourceId)
    const uniqueResourceIds = new Set(resourceIds)
    if (uniqueResourceIds.size !== 1) {
      throw new Error('All actions must have the same resourceId')
    }
  }
  const resourceId = Array.isArray(actions)
    ? getResourceId(actions[0].resourceId)
    : getResourceId(actions.resourceId)

  const instance = useSanityInstance(resourceId)
  const isDocumentReady = useCallback(
    () => getPermissionsState(instance, actions).getCurrent() !== undefined,
    [actions, instance],
  )
  if (!isDocumentReady()) {
    throw firstValueFrom(
      getPermissionsState(instance, actions).observable.pipe(
        filter((result) => result !== undefined),
      ),
    )
  }

  const {subscribe, getCurrent} = useMemo(
    () => getPermissionsState(instance, actions),
    [actions, instance],
  )

  return useSyncExternalStore(subscribe, getCurrent) as PermissionsResult
}

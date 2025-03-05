import {type DocumentAction, getPermissionsState, type PermissionsResult} from '@sanity/sdk'
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
  const instance = useSanityInstance()
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

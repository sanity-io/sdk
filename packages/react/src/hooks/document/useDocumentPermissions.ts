import {type DocumentAction, type DocumentPermissionsResult, getPermissionsState} from '@sanity/sdk'
import {useCallback, useContext, useMemo, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {ResourceContext} from '../../context/DefaultResourceContext'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useSanityInstance} from '../context/useSanityInstance'
import {
  normalizeResourceOptions,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

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
  actionOrActions:
    | WithResourceNameSupport<DocumentAction>
    | WithResourceNameSupport<DocumentAction>[],
): DocumentPermissionsResult {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useDocumentPermissions')
  const contextResource = useContext(ResourceContext)
  const resources = useContext(ResourcesContext)

  const normalizedActions = useMemo(() => {
    return Array.isArray(actionOrActions)
      ? actionOrActions.map((action) =>
          normalizeResourceOptions(action, resources, contextResource),
        )
      : [normalizeResourceOptions(actionOrActions, resources, contextResource)]
  }, [actionOrActions, resources, contextResource])

  // if actions is an array, we need to check that all actions belong to the same resource
  let resource

  for (const action of normalizedActions) {
    if (action.resource) {
      if (!resource) resource = action.resource
      if (action.resource !== resource) {
        throw new Error(
          `Mismatched resources found in actions. All actions must belong to the same resource. Found "${JSON.stringify(action.resource)}" but expected "${JSON.stringify(resource)}".`,
        )
      }
    }
  }

  const effectiveResource = resource ?? contextResource

  if (!effectiveResource) {
    throw new Error(
      'No resource found. Provide a resource via the action handle or wrap with a resource context.',
    )
  }

  const permissionsOptions = useMemo(
    () => ({resource: effectiveResource, actions: normalizedActions as DocumentAction[]}),
    [effectiveResource, normalizedActions],
  )

  const isDocumentReady = useCallback(
    () => getPermissionsState(instance, permissionsOptions).getCurrent() !== undefined,
    [permissionsOptions, instance],
  )
  if (!isDocumentReady()) {
    throw firstValueFrom(
      getPermissionsState(instance, permissionsOptions).observable.pipe(
        filter((result) => result !== undefined),
      ),
    )
  }

  const {subscribe, getCurrent} = useMemo(
    () => getPermissionsState(instance, permissionsOptions),
    [permissionsOptions, instance],
  )

  return useSyncExternalStore(subscribe, getCurrent) as DocumentPermissionsResult
}

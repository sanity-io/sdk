import {type DocumentAction, type DocumentPermissionsResult, getPermissionsState} from '@sanity/sdk'
import {isDeepEqual} from '@sanity/sdk/_internal'
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

const noopSubscribe = () => () => {}
const returnUndefined = () => undefined

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

  const {
    actions: normalizedActions,
    resource: actionResource,
    error: validationError,
  } = useMemo(() => {
    const normalized = Array.isArray(actionOrActions)
      ? actionOrActions.map((action) =>
          normalizeResourceOptions(action, resources, contextResource),
        )
      : [normalizeResourceOptions(actionOrActions, resources, contextResource)]

    let resource
    for (const action of normalized) {
      if (action.resource) {
        if (!resource) resource = action.resource
        if (!isDeepEqual(action.resource, resource)) {
          return {
            actions: normalized,
            resource,
            error: new Error(
              `Mismatched resources found in actions. All actions must belong to the same resource. Found "${JSON.stringify(action.resource)}" but expected "${JSON.stringify(resource)}".`,
            ),
          }
        }
      }
    }
    return {actions: normalized, resource, error: undefined}
  }, [actionOrActions, resources, contextResource])

  const effectiveResource = actionResource ?? contextResource

  // Keep hooks unconditional — validation errors and missing-resource errors are
  // thrown after all hooks so that the hook call count stays stable across renders.
  const permissionsOptions = useMemo(
    () =>
      effectiveResource
        ? {
            resource: effectiveResource,
            // `Omit<>` on `DocumentAction` loses the discriminant; runtime values are still actions.
            actions: normalizedActions as DocumentAction[],
          }
        : undefined,
    [effectiveResource, normalizedActions],
  )

  const isDocumentReady = useCallback(
    () =>
      permissionsOptions !== undefined &&
      getPermissionsState(instance, permissionsOptions).getCurrent() !== undefined,
    [permissionsOptions, instance],
  )

  const stateSource = useMemo(
    () => (permissionsOptions ? getPermissionsState(instance, permissionsOptions) : undefined),
    [permissionsOptions, instance],
  )

  const result = useSyncExternalStore(
    stateSource?.subscribe ?? noopSubscribe,
    stateSource?.getCurrent ?? returnUndefined,
  )

  // All hooks have been called — safe to throw now.
  if (validationError) throw validationError
  if (!effectiveResource) {
    throw new Error(
      'No resource found. Provide a resource via the action handle or wrap with a resource context.',
    )
  }
  if (!isDocumentReady()) {
    throw firstValueFrom(
      getPermissionsState(instance, permissionsOptions!).observable.pipe(
        filter((permissions) => permissions !== undefined),
      ),
    )
  }

  return result as DocumentPermissionsResult
}

import {hasPermission} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * A React hook that checks if the user has a given permission.
 *
 * @param permissionName - The name of the permission to check
 * @returns Whether the user has the given permission
 *
 * @example
 * ```tsx
 * function Permissions() {
 *   const canReadProject = useHasPermission("sanity.project.read")
 *   return <div>Can read project: {canReadProject ? 'Yes' : 'No'}</div>
 * }
 * ```
 *
 * @public
 */
export const useHasPermission: (permissionName: string) => boolean = createStateSourceHook(
  (instance, permissionName) => hasPermission(instance, {permissionName}),
)

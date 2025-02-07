import {getPermissionsByAction, type Permission} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * React hook that retrieves permissions based on a specific action (e.g., "read", "update", "delete").
 *
 * @param action - The action to filter permissions by (e.g., "read", "update", "delete")
 * @returns An array of permissions that match the given action
 *
 * @example
 * ```tsx
 * const readPermissions = usePermissionsByAction("read")
 * console.log(readPermissions)
 * // [
 * //   { name: "sanity.project.read", ... },
 * //   { name: "sanity.organization.read", ... }
 * // ]
 * ```
 */
export const usePermissionsByAction: (action: string) => Permission[] = createStateSourceHook(
  (instance, action) => getPermissionsByAction(instance, {action}),
)

import {getPermissionsByResource, type Permission} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * React hook that retrieves permissions based on a specific resource.
 *
 * @param resourceId - The resource ID to filter permissions by
 * @returns An object where keys are resource IDs and values are arrays of permissions
 *
 * @example
 * ```tsx
 * const permissionsByResource = usePermissionsByResource()
 * console.log(permissionsByResource)
 * // {
 * //   "xyz": [{ name: "sanity.project.read", resourceId: "xyz", ... }],
 * //   "abc": [{ name: "sanity.organization.read", resourceId: "abc", ... }]
 * // }
 * ```
 */
export const usePermissionsByResource: () => Record<string, Permission[]> = createStateSourceHook(
  (instance) => getPermissionsByResource(instance),
)

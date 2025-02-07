import {getPermissionsByType, type Permission} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * React hook that retrieves permissions based on a specific type (e.g., "sanity.organization").
 *
 * @param type - The type to filter permissions by (e.g., "sanity.organization")
 * @returns An array of permissions that match the given type
 *
 * @example
 * ```tsx
 * const orgPermissions = usePermissionsByType("sanity.organization")
 * console.log(orgPermissions)
 * // [
 * //   { name: "sanity.organization.read", ... },
 * //   { name: "sanity.organization.update", ... }
 * // ]
 * ```
 */
export const usePermissionsByType: (type: string) => Permission[] = createStateSourceHook(
  (instance, type) => getPermissionsByType(instance, {type}),
)

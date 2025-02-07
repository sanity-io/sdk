import {getPermissionsForResource, type Permission} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * React hook that retrieves permissions for a specific resource.
 *
 * @param resourceId - The ID of the resource to get permissions for
 * @returns An array of permissions that apply to the given resource
 *
 * @example
 * ```tsx
 * const projectPermissions = usePermissionsForResource("xyz")
 * console.log(projectPermissions)
 * // [
 * //   { name: "sanity.project.read", resourceId: "xyz", ... },
 * //   { name: "sanity.project.update", resourceId: "xyz", ... }
 * // ]
 * ```
 */
export const usePermissionsForResource: (resourceId: string) => Permission[] =
  createStateSourceHook((instance, resourceId) => getPermissionsForResource(instance, {resourceId}))

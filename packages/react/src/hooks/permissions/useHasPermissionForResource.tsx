import {hasPermissionForResource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * React hook that checks if a specific permission exists for a given resource.
 *
 * @param permissionName - The name of the permission to check (e.g., 'sanity.project.datasets.read')
 * @param resourceId - The ID of the resource to check permissions for
 * @returns A boolean indicating whether the permission exists for the resource
 *
 * @example
 * ```tsx
 * const canReadDataset = useHasPermissionForResource('sanity.project.datasets.read', '123')
 * if (canReadDataset) {
 *   // User has permission to read the dataset
 * }
 * ```
 */
export const useHasPermissionForResource: (permissionName: string, resourceId: string) => boolean =
  createStateSourceHook((instance, permissionName, resourceId) =>
    hasPermissionForResource(instance, {permissionName, resourceId}),
  )

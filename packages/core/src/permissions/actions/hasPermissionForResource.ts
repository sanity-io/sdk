import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * Checks if a specific permission exists for a given resource.
 *
 * This action creator returns a function that queries the permissions store to determine
 * if a particular permission exists for a specific resource. It uses memoization for
 * performance optimization.
 *
 * @public
 * @param options - Options object containing:
 *   - permissionName: The name of the permission to check
 *   - resourceId: The ID of the resource to check permissions against
 * @returns A function that when called, returns a boolean indicating if the permission exists
 *
 * @example
 * ```ts
 * // Create the action
 * const canReadDataset = hasPermissionForResource({
 *   permissionName: 'sanity.project.datasets.read',
 *   resourceId: '123'
 * })
 *
 * // Use the action to check permission
 * const hasPermission = canReadDataset()
 * if (hasPermission) {
 *   // User has permission to read the dataset
 * }
 * ```
 */
export const hasPermissionForResource = createStateSourceAction(
  permissionsStore,
  (
    state: {permissions: Permission[]},
    {permissionName, resourceId}: {permissionName: string; resourceId: string},
  ) => {
    return selectHasPermissionForResource(state, {permissionName, resourceId})
  },
)

// Create the memoized selector outside the action creator
const selectHasPermissionForResource = createSelector(
  [
    (state: {permissions: Permission[]}) => state.permissions,
    (_state: {permissions: Permission[]}, props: {permissionName: string; resourceId: string}) =>
      props,
  ],
  (permissions, {permissionName, resourceId}) =>
    permissions.some(
      (permission) =>
        permission.name === permissionName &&
        (permission.resourceId === resourceId || permission.resourceId === '*'),
    ),
)

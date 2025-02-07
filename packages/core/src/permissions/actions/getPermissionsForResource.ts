import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 * Retrieves all permissions for a specific resource.
 *
 * @param resourceId - The ID of the resource to get permissions for.
 * @returns The permissions that apply to the given resource.
 *
 * @example
 * ```ts
 * const projectPermissions = getPermissionsForResource("xyz");
 * console.log(projectPermissions);
 * // [
 * //   { name: "sanity.project.read", resourceId: "xyz", ... },
 * //   { name: "sanity.project.update", resourceId: "xyz", ... }
 * // ]
 * ```
 */
export const getPermissionsForResource = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}, props: {resourceId: string}) => {
    return selectPermissionsForResource(state, props)
  },
)

// Create the memoized selector outside the action creator
const selectPermissionsForResource = createSelector(
  [
    (state: {permissions: Permission[]}) => state.permissions,
    (_: {permissions: Permission[]}, props: {resourceId: string}) => props.resourceId,
  ],
  (permissions, resourceId) =>
    permissions.filter(
      (permission) => permission.resourceId === resourceId || permission.resourceId === '*',
    ),
)

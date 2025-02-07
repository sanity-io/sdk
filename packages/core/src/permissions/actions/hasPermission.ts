import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 * Checks if a user has a specific permission.
 *
 * @param permissionName - The name of the permission to check (e.g., "sanity.organization.read").
 * @returns Whether the user has the given permission.
 *
 * @example
 * ```ts
 * const canReadOrg = hasPermission("sanity.organization.read");
 * console.log(canReadOrg); // true or false
 * ```
 */
export const hasPermission = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}, {permissionName}: {permissionName: string}) => {
    return selectHasPermission(state, {permissionName})
  },
)

// Create the memoized selector outside the action creator
const selectHasPermission = createSelector(
  [
    (state: {permissions: Permission[]}) => state.permissions,
    (_: {permissions: Permission[]}, props: {permissionName: string}) => props.permissionName,
  ],
  (permissions, permissionName) =>
    permissions.some((permission) => permission.name === permissionName),
)

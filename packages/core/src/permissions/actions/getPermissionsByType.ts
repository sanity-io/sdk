import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 * Retrieves all permissions of a specific type.
 *
 * @param type - The type of the permissions to get (e.g., "sanity.organization").
 * @returns The permissions that match the given type.
 *
 * @example
 * ```ts
 * const orgPermissions = getPermissionsByType("sanity.organization");
 * console.log(orgPermissions);
 * // [
 * //   { name: "sanity.organization.read", ... },
 * //   { name: "sanity.organization.update", ... }
 * // ]
 * ```
 */
export const getPermissionsByType = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}, props: {type: string}) => {
    return selectPermissionsByType(state, props)
  },
)

// Create the memoized selector outside the action creator
const selectPermissionsByType = createSelector(
  [
    (state: {permissions: Permission[]}) => state.permissions,
    (_: {permissions: Permission[]}, props: {type: string}) => props.type,
  ],
  (permissions, type) => permissions.filter((permission) => permission.type.startsWith(type)),
)

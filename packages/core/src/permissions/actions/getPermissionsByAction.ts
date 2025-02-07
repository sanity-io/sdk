import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

// Create the memoized selector outside the action creator
const selectPermissionsByAction = createSelector(
  [
    (state: {permissions: Permission[]}) => state.permissions,
    (_state: {permissions: Permission[]}, props: {action: string}) => props.action,
  ],
  (permissions, action) =>
    permissions.filter((permission) => permission.name.includes(`.${action}`)),
)

/**
 * @public
 * Retrieves permissions based on a specific action (e.g., "read", "update", "delete").
 *
 * @param action - The action to filter permissions by.
 * @returns The permissions that match the given action.
 *
 * @example
 * ```ts
 * const readPermissions = getPermissionsByAction("read");
 * console.log(readPermissions);
 * // [
 * //   { name: "sanity.project.read", ... },
 * //   { name: "sanity.organization.read", ... }
 * // ]
 * ```
 */
export const getPermissionsByAction = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}, props: {action: string}) => {
    return selectPermissionsByAction(state, props)
  },
)

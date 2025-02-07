import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 * Retrieves a set of all unique resource types from the permissions list.
 *
 * @returns A set containing unique resource types.
 *
 * @example
 * ```ts
 * const resourceTypes = getPermissionsResourceTypes();
 * console.log(resourceTypes);
 * // Set { "organization", "project", "document" }
 * ```
 */
export const getPermissionsResourceTypes = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}) => {
    return selectPermissionsResourceTypes(state)
  },
)

// Create the memoized selector outside the action creator
const selectPermissionsResourceTypes = createSelector(
  [(state: {permissions: Permission[]}) => state.permissions],
  (permissions) => new Set(permissions.map((permission) => permission.resourceType)),
)

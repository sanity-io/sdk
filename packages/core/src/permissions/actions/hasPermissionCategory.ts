import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 * Checks if a user has any permission in a given category.
 *
 * @param category - The category of permissions to check (e.g., "sanity.project.members").
 * @returns Whether the user has any permission in the given category.
 *
 * @example
 * ```ts
 * const canManageMembers = hasPermissionCategory("sanity.project.members");
 * console.log(canManageMembers); // true or false
 * ```
 */
export const hasPermissionCategory = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}, {category}: {category: string}) => {
    return selectHasPermissionCategory(state, {category})
  },
)

// Create the memoized selector outside the action creator
const selectHasPermissionCategory = createSelector(
  [
    (state: {permissions: Permission[]}) => state.permissions,
    (_: {permissions: Permission[]}, props: {category: string}) => props.category,
  ],
  (permissions, category) => permissions.some((permission) => permission.name.startsWith(category)),
)

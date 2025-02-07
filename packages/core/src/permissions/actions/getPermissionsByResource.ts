import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 * Groups all permissions by resource ID.
 *
 * @returns An object where keys are resource IDs and values are arrays of permissions.
 *
 * @example
 * ```ts
 * const permissionsByResource = getPermissionsByResource();
 * console.log(permissionsByResource);
 * // {
 * //   "xyz": [{ name: "sanity.project.read", resourceId: "xyz", ... }],
 * //   "abc": [{ name: "sanity.organization.read", resourceId: "abc", ... }]
 * // }
 * ```
 */
export const getPermissionsByResource = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}) => {
    return selectPermissionsByResource(state)
  },
)

// Create the memoized selector outside the action creator
const selectPermissionsByResource = createSelector(
  [(state: {permissions: Permission[]}) => state.permissions],
  (permissions) => {
    return permissions.reduce(
      (acc, permission) => {
        const key = permission.resourceId || 'global'
        if (!acc[key]) acc[key] = []
        acc[key].push(permission)
        return acc
      },
      {} as Record<string, Array<Permission>>,
    )
  },
)

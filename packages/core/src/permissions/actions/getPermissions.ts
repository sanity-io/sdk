import {createSelector} from 'reselect'

import {createStateSourceAction} from '../../resources/createStateSourceAction'
import {type Permission, permissionsStore} from '../permissionsStore'

/**
 * @public
 */
export interface GetPermissionsResult {
  [resourceType: string]: {
    [resourceId: string]: Permission['name'][]
  }
}

/**
 * @public
 * Generates a structured summary of permissions, grouped by resource type and resource ID.
 *
 * @returns An object containing permissions grouped by resource type and ID.
 *
 * @example
 * ```ts
 * const permissions = getPermissions();
 * console.log(permissions);
 * // {
 * //   "organization": {
 * //     "org123": ["sanity.organization.read", "sanity.organization.update"]
 * //   },
 * //   "project": {
 * //     "proj456": ["sanity.project.read", "sanity.project.update"]
 * //   }
 * // }
 * ```
 */
export const getPermissions = createStateSourceAction(
  permissionsStore,
  (state: {permissions: Permission[]}) => {
    return selectPermissionsGrouped(state)
  },
)

// Create the memoized selector outside the action creator
const selectPermissionsGrouped = createSelector(
  [(state: {permissions: Permission[]}) => state.permissions],
  (permissions) => {
    return permissions.reduce(
      (acc, perm: Permission) => {
        if (!acc[perm.resourceType]) acc[perm.resourceType] = {}
        if (!acc[perm.resourceType][perm.resourceId]) acc[perm.resourceType][perm.resourceId] = []
        acc[perm.resourceType][perm.resourceId].push(perm.name)
        return acc
      },
      {} as Record<string, Record<string, Permission['name'][]>>,
    )
  },
)

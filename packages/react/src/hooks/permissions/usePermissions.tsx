import {getPermissions, type GetPermissionsResult} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * A React hook that subscribes to permissions changes.
 *
 * This hook provides access to the current permissions from Sanity.
 * It automatically re-renders when the permissions changes.
 *
 * @remarks
 * The hook uses `useSyncExternalStore` to safely subscribe to permissions changes
 * and ensure consistency between server and client rendering.
 *
 * @returns An object containing permissions grouped by resource type and ID
 *
 * @example
 * ```tsx
 * function PermissionsDisplay() {
 *   const permissions = usePermissions()
 *
 *   // permissions might look like:
 *   // {
 *   //   "organization": {
 *   //     "org123": ["sanity.organization.read", "sanity.organization.update"]
 *   //   },
 *   //   "project": {
 *   //     "proj456": ["sanity.project.read", "sanity.project.update"]
 *   //   }
 *   // }
 *
 *   return (
 *     <pre>
 *       {JSON.stringify(permissions, null, 2)}
 *     </pre>
 *   )
 * }
 * ```
 *
 * @public
 */
export const usePermissions: () => GetPermissionsResult = createStateSourceHook(getPermissions)

import {hasPermissionCategory} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * A React hook that checks if the user has any permissions in a given category.
 *
 * @param category - The category of permissions to check (e.g., "sanity.project.members")
 * @returns Whether the user has any permissions in the given category
 *
 * @example
 * ```tsx
 * function MembersManagement() {
 *   const canManageMembers = useHasPermissionCategory("sanity.project.members")
 *
 *   if (!canManageMembers) {
 *     return <div>You don't have permission to manage members</div>
 *   }
 *
 *   return <div>Members management interface...</div>
 * }
 * ```
 *
 * @public
 */
export const useHasPermissionCategory: (category: string) => boolean = createStateSourceHook(
  (instance, category) => hasPermissionCategory(instance, {category}),
)

import {getPermissionsResourceTypes} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * React hook that retrieves a set of all unique resource types from the permissions list.
 *
 * @returns A set containing unique resource types
 *
 * @example
 * ```tsx
 * const resourceTypes = usePermissionsResourceTypes()
 * console.log(resourceTypes)
 * // Set { "organization", "project", "document" }
 * ```
 */
export const usePermissionsResourceTypes: () => Set<string> = createStateSourceHook((instance) =>
  getPermissionsResourceTypes(instance),
)

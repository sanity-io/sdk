import {type AccessResourceType, checkPermissions} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * Checks whether the current user holds the given permissions on a resource.
 *
 * The hook suspends until the first fetch succeeds, so `data` is always present.
 * `data` maps each requested permission to whether the user has it — keyed by
 * exactly the permission strings you passed.
 *
 * @public
 * @param resourceType - The type of resource (e.g. `'project'`, `'organization'`).
 * @param resourceId - The resource id.
 * @param permissions - The permission names to check.
 * @returns The result envelope `{data, isFetching, error, refetch}`.
 */
export const useCheckPermissions = createFetcherHook(checkPermissions) as <
  Permission extends string,
>(
  resourceType: AccessResourceType,
  resourceId: string,
  permissions: Permission[],
) => FetcherHookResult<Record<Permission, boolean>>

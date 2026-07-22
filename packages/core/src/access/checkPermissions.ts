import {map, switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {defineFetcher} from '../store/fetcherStore'

const API_VERSION = 'v2025-07-11'

/**
 * The resource types the Access API can scope a permission check to.
 *
 * @see https://www.sanity.io/docs/http-reference/access-api
 * @public
 */
export type AccessResourceType =
  | 'organization'
  | 'project'
  | 'media-library'
  | 'canvas'
  | 'dashboard'
  | 'view'

/**
 * Fetcher checking whether the current user holds the given permissions on a
 * resource (`GET /access/:resourceType/:resourceId/user-permissions/me/check`),
 * on the shared fetcher cache. Resolves to a map of each requested permission
 * to whether the user has it. The key sorts the permission list, so permission
 * order doesn't create distinct cache entries.
 *
 * @see https://www.sanity.io/docs/http-reference/access-api
 * @internal
 */
export const checkPermissions = defineFetcher<
  [resourceType: AccessResourceType, resourceId: string, permissions: string[]],
  Record<string, boolean>
>({
  name: 'checkPermissions',
  getKey: (_instance, resourceType, resourceId, permissions) =>
    `${resourceType}:${resourceId}:${[...permissions].sort().join(',')}`,
  fetch: (instance) => (resourceType, resourceId, permissions) =>
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable
          .request<{data: Record<string, boolean>}>({
            uri: `/access/${resourceType}/${resourceId}/user-permissions/me/check`,
            query: {permissions},
            tag: 'access.check',
          })
          .pipe(map((response) => response.data)),
      ),
    ),
  tags: (_data, resourceType, resourceId) => [
    {type: 'access', id: `${resourceType}:${resourceId}`},
  ],
})

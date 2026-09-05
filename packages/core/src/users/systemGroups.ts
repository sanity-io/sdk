import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DatasetResource} from '../config/sanityConfig'
import {defineFetcher} from '../store/fetcherStore'
import {SYSTEM_GROUPS_API_VERSION, SYSTEM_GROUPS_STALE_TIME} from './usersConstants'

const SYSTEM_GROUPS_QUERY = '*[_type == "system.group"]{members, grants}'

/**
 * One dataset access group: the users it holds, and the grants those users get.
 * A grant's `filter` is GROQ, evaluated against a document to decide whether
 * the grant's `permissions` apply to it.
 *
 * @internal
 */
export interface SystemGroup {
  members?: string[]
  grants?: {filter: string; permissions: string[]}[]
}

/**
 * Fetcher for a dataset's access groups, on the shared fetcher cache.
 *
 * These are the only way to learn what a user *other than the current one* may
 * do in a dataset: `/acl` answers for the requesting session alone. Reading
 * them requires access to the `system.group` documents, so this can fail for
 * users who have access to the dataset but not to its ACL.
 *
 * @internal
 */
export const systemGroups = defineFetcher<[resource: DatasetResource], SystemGroup[]>({
  name: 'systemGroups',
  getKey: (_instance, resource) => `${resource.projectId}.${resource.dataset}`,
  fetch: (instance) => (resource) =>
    getClientState(instance, {
      apiVersion: SYSTEM_GROUPS_API_VERSION,
      resource,
    }).observable.pipe(
      switchMap((client) =>
        client.observable.fetch<SystemGroup[]>(
          SYSTEM_GROUPS_QUERY,
          {},
          {perspective: 'raw', tag: 'users.system-groups'},
        ),
      ),
    ),
  staleTime: SYSTEM_GROUPS_STALE_TIME,
})

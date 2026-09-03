import {type SanityClient} from '@sanity/client'
import {EMPTY, expand, type Observable, reduce, switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {defineFetcher} from '../store/fetcherStore'
import {buildQuery} from '../utils/buildQuery'
import {type SanityUserResponse} from './types'
import {
  API_VERSION,
  PROJECT_USER_IDS_MAX_PAGES,
  PROJECT_USER_IDS_PAGE_SIZE,
  PROJECT_USER_IDS_STALE_TIME,
} from './usersConstants'

/**
 * Maps each member's account-wide `sanityUserId` to the project user id that a
 * dataset's access groups know them by.
 *
 * @internal
 */
export type ProjectUserIds = ReadonlyMap<string, string>

/**
 * A project users read carries each member's project user id inline, so this
 * only exists for reads that don't: the organization users endpoint returns no
 * project user id at all, leaving no way to match an organization member
 * against a dataset's access groups without looking the id up here.
 */
function readPage(
  client: SanityClient,
  projectId: string,
  cursor?: string,
): Observable<SanityUserResponse> {
  return client.observable.request<SanityUserResponse>({
    method: 'GET',
    uri: `access/project/${projectId}/users`,
    tag: 'users.project-user-ids',
    query: buildQuery({limit: PROJECT_USER_IDS_PAGE_SIZE, nextCursor: cursor}),
  })
}

function collect(
  ids: Map<string, string>,
  response: SanityUserResponse,
  projectId: string,
): Map<string, string> {
  for (const user of response.data) {
    const projectUserId = user.memberships.find(
      (membership) => membership.resourceType === 'project' && membership.resourceId === projectId,
    )?.resourceUserId

    if (projectUserId) ids.set(user.sanityUserId, projectUserId)
  }
  return ids
}

/**
 * Fetcher for a project's `sanityUserId` to project user id map, on the shared
 * fetcher cache.
 *
 * Walks every page of the project's members, so it is only worth reading when
 * the id is not already to hand. Grants decide who may see a document, so an
 * incomplete map would deny real access: rather than truncate past
 * `PROJECT_USER_IDS_MAX_PAGES`, this fails loudly.
 *
 * That same cost is why entries stay fresh for an hour. A member added since
 * the last walk is the only thing staleness can get wrong, and `usersWithGrants`
 * spots and rebuilds for that rather than leaving it to expire.
 *
 * @internal
 */
export const projectUserIds = defineFetcher<[projectId: string], ProjectUserIds>({
  name: 'projectUserIds',
  getKey: (_instance, projectId) => projectId,
  fetch: (instance) => (projectId) =>
    getClientState(instance, {scope: 'global', apiVersion: API_VERSION}).observable.pipe(
      switchMap((client) => {
        let pages = 0

        return readPage(client, projectId).pipe(
          expand((response) => {
            if (!response.nextCursor) return EMPTY

            pages += 1
            if (pages >= PROJECT_USER_IDS_MAX_PAGES) {
              throw new Error(
                `Cannot resolve project user ids for ${projectId}: the project has more than ${PROJECT_USER_IDS_MAX_PAGES * PROJECT_USER_IDS_PAGE_SIZE} members. Read users with a project audience, which carries each project user id inline.`,
              )
            }

            return readPage(client, projectId, response.nextCursor)
          }),
          reduce<SanityUserResponse, Map<string, string>>(
            (ids, response) => collect(ids, response, projectId),
            new Map(),
          ),
        )
      }),
    ),
  staleTime: PROJECT_USER_IDS_STALE_TIME,
})

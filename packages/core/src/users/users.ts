import {type SanityUser as SanityUserFromClient} from '@sanity/client'
import {filter, map, type Observable, of, switchMap, take} from 'rxjs'

import {type ClientOptions, getClientState} from '../client/clientStore'
import {observeAppOrganizationId} from '../organization/appOrganization'
import {type SanityInstance} from '../store/createSanityInstance'
import {definePagedFetcher} from '../store/fetcherStore'
import {type GetUsersOptions, type SanityUser, type SanityUserResponse} from './types'
import {API_VERSION, DEFAULT_USERS_BATCH_SIZE, PROJECT_API_VERSION} from './usersConstants'

// A user as the project API answers
type ProjectUser = Omit<SanityUserFromClient, 'id'> & {
  id: string
  sanityUserId: string
  email: string
  provider: string
}

function get<T>(
  instance: SanityInstance,
  clientOptions: ClientOptions,
  request: {url: string; tag: string; query?: Record<string, string>},
): Observable<T> {
  return getClientState(instance, clientOptions).observable.pipe(
    switchMap((client) => client.observable.request<T>({method: 'GET', ...request})),
  )
}

/**
 * Which resource a list of users is read from. Explicit wins. Failing that, whichever id was
 * given decides, and an organization list is what is left when neither was: the organization can
 * be resolved from the app itself, a project cannot.
 */
function usersResource(
  instance: SanityInstance,
  {resourceType, organizationId, projectId = instance.config.projectId}: GetUsersOptions = {},
): {type: 'project' | 'organization'; id: string | undefined} {
  const type = resourceType ?? (organizationId || !projectId ? 'organization' : 'project')
  if (type === 'organization') return {type, id: organizationId}
  if (!projectId) throw new Error('Project ID required for this API.')
  return {type, id: projectId}
}

/**
 * Where one user is read from: a project user (an ID starting with `p`) from its project's API,
 * any other from the access API of the resource it belongs to.
 */
function userSource(
  instance: SanityInstance,
  {
    userId,
    resourceType = 'project',
    organizationId,
    projectId = instance.config.projectId,
  }: GetUsersOptions & {userId: string},
) {
  if (userId.startsWith('p')) return {userId, projectId}
  const resourceId = resourceType === 'organization' ? organizationId : projectId
  if (!resourceId) throw new Error('An organizationId or a projectId is required')
  return {userId, resourceType, resourceId}
}

// One user, as the only user in a list, the way the users store answers for a `userId`
function readUser(
  instance: SanityInstance,
  options: GetUsersOptions & {userId: string},
): Observable<SanityUserResponse> {
  const source = userSource(instance, options)
  if ('resourceId' in source) {
    return get<SanityUser | SanityUserResponse>(
      instance,
      {scope: source.userId.startsWith('g') ? 'global' : undefined, apiVersion: API_VERSION},
      {
        url: `access/${source.resourceType}/${source.resourceId}/users/${source.userId}`,
        tag: 'users.get',
      },
    ).pipe(
      map((response) =>
        'sanityUserId' in response ? {data: [response], totalCount: 1, nextCursor: null} : response,
      ),
    )
  }
  return get<ProjectUser>(
    instance,
    {apiVersion: PROJECT_API_VERSION, projectId: source.projectId},
    {url: `/users/${source.userId}`, tag: 'users.get'},
  ).pipe(
    map((projectUser) => ({
      data: [
        {
          sanityUserId: projectUser.sanityUserId,
          profile: {
            id: projectUser.id,
            displayName: projectUser.displayName,
            familyName: projectUser.familyName ?? undefined,
            givenName: projectUser.givenName ?? undefined,
            middleName: projectUser.middleName ?? undefined,
            imageUrl: projectUser.imageUrl ?? undefined,
            createdAt: projectUser.createdAt,
            updatedAt: projectUser.updatedAt,
            isCurrentUser: projectUser.isCurrentUser,
            email: projectUser.email,
            provider: projectUser.provider,
          },
          memberships: [],
        },
      ],
      totalCount: 1,
      nextCursor: null,
    })),
  )
}

/**
 * Fetcher for the users of a project or an organization, on the shared fetcher cache, a batch at
 * a time. Without an `organizationId`, an organization's list waits for the app's organization.
 * With a `userId`, it reads only that user.
 *
 * @internal
 */
export const users = definePagedFetcher<[options?: GetUsersOptions], SanityUserResponse>({
  name: 'users',
  getKey: (instance, options) =>
    JSON.stringify(
      options?.userId
        ? userSource(instance, {...options, userId: options.userId})
        : {
            ...usersResource(instance, options),
            batchSize: options?.batchSize ?? DEFAULT_USERS_BATCH_SIZE,
          },
    ),
  fetch: (instance) => (cursor, options) => {
    if (options?.userId) return readUser(instance, {...options, userId: options.userId})
    const {type, id} = usersResource(instance, options)
    const limit = String(options?.batchSize ?? DEFAULT_USERS_BATCH_SIZE)
    const resourceId$ = id
      ? of(id)
      : observeAppOrganizationId(instance).pipe(filter((appId) => typeof appId === 'string'))
    return resourceId$.pipe(
      take(1),
      switchMap((resourceId) =>
        get<SanityUserResponse>(
          instance,
          {scope: 'global', apiVersion: API_VERSION},
          {
            url: `access/${type}/${resourceId}/users`,
            tag: 'users.list',
            query: cursor ? {nextCursor: cursor, limit} : {limit},
          },
        ),
      ),
    )
  },
})

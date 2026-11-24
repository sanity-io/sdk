import {ClientError, type SanityClient} from '@sanity/client'
import {catchError, forkJoin, map, type Observable, of, switchMap, take, throwError} from 'rxjs'

import {getClientErrorApiBody} from '../auth/utils'
import {type ClientOptions, getClientState} from '../client/clientStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {type GetUsersOptions, type SanityUser, type SanityUserResponse} from './types'
import {
  MAX_FORBIDDEN_USER_ID_RETRIES,
  MAX_USER_IDS_BATCH_SIZE,
  PROJECT_API_VERSION,
} from './usersConstants'

const SANITY_USER_ID_RE = /^g[a-zA-Z0-9-]+$/
const PROJECT_USER_ID_RE = /^p[a-zA-Z0-9-]+$/
const EXTERNAL_USER_ID_RE = /^e[a-zA-Z0-9\-_]+$/
const DISALLOWED_USER_ID_RE = /Not allowed to fetch user with ID ([a-zA-Z0-9_-]+)/

/**
 * Shape returned by the legacy `GET /users/:userId` endpoint for project (`p*`), global (`g*`),
 * and external (`e*`) users.
 */
export interface LegacyUser {
  id: string
  sanityUserId?: string
  displayName: string
  email?: string | null
  familyName?: string | null
  givenName?: string | null
  middleName?: string | null
  imageUrl?: string | null
  provider?: string | null
  providerId?: string
  tosAcceptedAt?: string | null
  createdAt: string
  updatedAt?: string
  isCurrentUser?: boolean
}

/**
 * Normalizes a legacy `/users/:userId` record into the SDK's {@link SanityUser} shape.
 */
export function toSanityUser(user: LegacyUser): SanityUser {
  return {
    sanityUserId: user.sanityUserId ?? user.id,
    profile: {
      id: user.id,
      displayName: user.displayName,
      familyName: user.familyName ?? undefined,
      givenName: user.givenName ?? undefined,
      middleName: user.middleName ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isCurrentUser: user.isCurrentUser,
      email: user.email ?? '',
      provider: user.provider ?? '',
      ...(user.tosAcceptedAt ? {tosAcceptedAt: user.tosAcceptedAt} : {}),
      ...(user.providerId ? {providerId: user.providerId} : {}),
    },
    memberships: [],
  }
}

function isResolvableUserId(id: string, isProjectScoped: boolean): boolean {
  if (SANITY_USER_ID_RE.test(id) || PROJECT_USER_ID_RE.test(id)) return true
  return isProjectScoped && EXTERNAL_USER_ID_RE.test(id)
}

function normalizeUserIds(userIds: readonly string[], isProjectScoped: boolean): string[] {
  const unique = new Set<string>()
  for (const id of userIds) {
    if (isResolvableUserId(id, isProjectScoped)) {
      unique.add(id)
    }
  }
  return Array.from(unique).sort()
}

function chunkIds(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

function extractDisallowedUserId(error: ClientError): string | undefined {
  const message = getClientErrorApiBody(error)?.message ?? error.message
  return DISALLOWED_USER_ID_RE.exec(message)?.[1]
}

function fetchUsersChunk(
  client: SanityClient,
  ids: readonly string[],
  retriesLeft = MAX_FORBIDDEN_USER_ID_RETRIES,
): Observable<SanityUser[]> {
  return client.observable
    .request<LegacyUser | LegacyUser[]>({
      method: 'GET',
      url: `/users/${ids.join(',')}`,
      tag: 'users.get',
    })
    .pipe(
      map((response) => (Array.isArray(response) ? response : response ? [response] : [])),
      map((items) => items.map(toSanityUser)),
      catchError((error: unknown) => {
        if (!(error instanceof ClientError)) return throwError(() => error)
        if (error.statusCode === 404) return of([])
        if (error.statusCode !== 403) return throwError(() => error)

        const disallowedId = extractDisallowedUserId(error)
        if (!disallowedId || retriesLeft <= 0 || !ids.includes(disallowedId)) return of([])

        const remaining = ids.filter((id) => id !== disallowedId)
        if (remaining.length === 0) return of([])
        return fetchUsersChunk(client, remaining, retriesLeft - 1)
      }),
    )
}

/**
 * Normalized lookup descriptor for resolving specific user IDs via the legacy `/users/:ids` API.
 * Used as both the cache key and request scope so callers passing the same IDs in different order
 * or with duplicates share a single cached entry.
 */
export function usersByIdsSource(
  instance: SanityInstance,
  {
    userIds,
    resourceType,
    organizationId,
    projectId = instance.config.projectId,
  }: GetUsersOptions & {userIds: string[]},
): {scope: 'global'; userIds: string[]} | {projectId: string; userIds: string[]} {
  const isGlobal = resourceType === 'organization' || Boolean(organizationId) || !projectId
  if (isGlobal) {
    return {scope: 'global', userIds: normalizeUserIds(userIds, false)}
  }
  return {projectId, userIds: normalizeUserIds(userIds, true)}
}

/**
 * Resolves a specific list of user IDs through the legacy comma-separated `GET /users/:ids`
 * endpoint, chunking large batches and gracefully omitting unknown, deleted, or inaccessible IDs.
 */
export function readUsersByIds(
  instance: SanityInstance,
  options: GetUsersOptions & {userIds: string[]},
): Observable<SanityUserResponse> {
  const source = usersByIdsSource(instance, options)
  if (source.userIds.length === 0) {
    return of({data: [], totalCount: 0, nextCursor: null})
  }

  const clientOptions: ClientOptions =
    'scope' in source
      ? {scope: 'global', apiVersion: PROJECT_API_VERSION}
      : {projectId: source.projectId, apiVersion: PROJECT_API_VERSION}

  const chunks = chunkIds(source.userIds, MAX_USER_IDS_BATCH_SIZE)

  return getClientState(instance, clientOptions).observable.pipe(
    take(1),
    switchMap((client) => forkJoin(chunks.map((chunk) => fetchUsersChunk(client, chunk)))),
    map((batches) => {
      const data = batches.flat()
      return {data, totalCount: data.length, nextCursor: null}
    }),
  )
}

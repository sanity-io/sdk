import {type GetUsersOptions, type SanityUser, users} from '@sanity/sdk'
import {useDeferredValue, useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {createPagedFetcherHook} from '../helpers/createPagedFetcherHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

const useUsersFetcher = createPagedFetcherHook(users)

/**
 * @public
 * @category Types
 * @category Users
 */
export interface UsersResult {
  /**
   * The users fetched.
   */
  data: SanityUser[]
  /**
   * How many users the resource has, including those not fetched yet.
   */
  totalCount: number
  /**
   * Whether there are more users to fetch.
   */
  hasMore: boolean

  /**
   * Whether a users request is currently in progress
   */
  isPending: boolean
  /**
   * Load more users. A failure shows on `error`, keeping the users already shown.
   */
  loadMore: () => void
  /**
   * The most recent failure to read users while some still show, like a failed `loadMore`;
   * cleared by the next successful read.
   */
  error: unknown
}

/**
 * Injects a resolved `projectId` into project-scoped users options. A missing
 * `projectId` is a no-op, and organization-scoped queries (explicit
 * `resourceType`/`organizationId`) or options that already carry a `projectId`
 * are returned unchanged.
 */
function withResolvedProjectId(
  options: GetUsersOptions | undefined,
  projectId: string | undefined,
): GetUsersOptions | undefined {
  if (!projectId) return options
  if (!options) return {projectId}
  const isOrgScoped = options.resourceType === 'organization' || !!options.organizationId
  if (isOrgScoped || options.projectId) return options
  return {...options, projectId}
}

function normalizeUsersOptions(
  options: GetUsersOptions | undefined,
  projectId: string | undefined,
): GetUsersOptions | undefined {
  const resolved = withResolvedProjectId(options, projectId)
  if (!resolved?.userIds) return resolved
  return {...resolved, userIds: Array.from(new Set(resolved.userIds)).sort()}
}

/**
 *
 * @public
 *
 * Retrieves users for a given resource (either a project or an organization), or resolves a
 * specific set of user IDs when `userIds` is provided.
 *
 * @category Users
 * @param options - Resource options (`resourceType`, `projectId`, `organizationId`, `batchSize`) or `userIds` to resolve specific users
 * @returns A list of users, how many users the resource has in total, a boolean indicating whether there are more users to fetch, and a function to load more users
 *
 * @example
 * ```
 * const { data, totalCount, hasMore, loadMore, isPending } = useUsers({
 *   resourceType: 'organization',
 *   organizationId: 'my-org-id',
 *   batchSize: 10,
 * })
 *
 * return (
 *   <div>
 *     {data.map(user => (
 *       <figure key={user.sanityUserId}>
 *         <img src={user.profile.imageUrl} alt='' />
 *         <figcaption>{user.profile.displayName}</figcaption>
 *         <address>{user.profile.email}</address>
 *       </figure>
 *     ))}
 *     <p>Showing {data.length} of {totalCount}</p>
 *     {hasMore && <button onClick={loadMore}>{isPending ? 'Loading...' : 'Load More'}</button>}
 *   </div>
 * )
 * ```
 *
 * @example Resolve specific user IDs (e.g. document history contributors)
 * ```
 * const { data } = useUsers({
 *   userIds: ['pUser1', 'gUser2'],
 * })
 * ```
 * @remarks
 * For project-scoped queries the `projectId` is resolved in order from:
 * 1. an explicit `projectId` option
 * 2. A legacy ProjectContext (e.g. a `<ResourceProvider projectId="…">` with no dataset), then
 * 3. The active resource (`ResourceProvider`/`SDKProvider`)
 * 4. `instance.config`.
 *
 * When `userIds` is provided, users are resolved in batches via the legacy `/users/:ids` endpoint
 * (without `memberships`), and unknown, deleted, or inaccessible IDs are omitted rather than
 * throwing an error.
 */
export function useUsers(options?: GetUsersOptions): UsersResult {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useUsers')
  const resolvedProjectId = useResolvedProjectId(options)
  // A string, so options written inline don't count as another list on every render
  const key = JSON.stringify(normalizeUsersOptions(options, resolvedProjectId) ?? {})
  // The users already shown stay on screen while another list loads
  const shownKey = useDeferredValue(key)
  const shown = useMemo<GetUsersOptions>(() => JSON.parse(shownKey), [shownKey])
  const {data, hasMore, isPending, loadMore, error} = useUsersFetcher(shown)
  return {
    data: data.data,
    totalCount: data.totalCount,
    hasMore,
    isPending: isPending || shownKey !== key,
    loadMore,
    error,
  }
}

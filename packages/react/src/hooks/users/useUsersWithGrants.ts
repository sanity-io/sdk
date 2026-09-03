import {
  getUsersWithGrantsState,
  loadMoreUsersWithGrants,
  resolveUsersWithGrants,
  type UsersWithGrantsOptions,
  type UserWithGrants,
} from '@sanity/sdk'
import {getUsersWithGrantsKey, parseUsersWithGrantsKey} from '@sanity/sdk/_internal'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useDeferredRequestKey} from '../helpers/useDeferredRequestKey'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {useResolvedProjectId, withResolvedProjectId} from '../helpers/useResolvedProjectId'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * Stands in for the absent handle so the normalizing hook can be called
 * unconditionally. Never reaches core: the result is only read when the caller
 * actually passed a document.
 */
const EMPTY_DOCUMENT: DocumentHandle = {documentId: '', documentType: ''}

/**
 * @public
 * @category Types
 */
export interface UseUsersWithGrantsOptions extends Omit<UsersWithGrantsOptions, 'document'> {
  /**
   * The document to measure each user against. Accepts a `resourceName` on top
   * of the core handle, so it resolves against `<SanityApp>`'s `resources`.
   */
  document?: DocumentHandle
}

/**
 * @public
 * @category Types
 */
export interface UsersWithGrantsHookResult {
  /**
   * The users fetched, each carrying whether they hold the grant.
   */
  data: UserWithGrants[]
  /**
   * Whether there are more users to fetch.
   */
  hasMore: boolean
  /**
   * Whether a users request is currently in progress
   */
  isPending: boolean
  /**
   * Load more users.
   */
  loadMore: () => void
}

/**
 *
 * @public
 *
 * Retrieves the users for a project or an organization, each annotated with
 * whether they hold a grant on a document.
 *
 * Users who do not hold the grant are returned with `granted: false` rather
 * than dropped, so a picker can show them as unavailable. Filtering them out
 * here would make pagination misleading: `hasMore` tracks the unfiltered list,
 * so a full page could yield only a handful of visible users.
 *
 * @category Users
 * @param options - The resource to read users from, the batch size, and optionally the document to measure them against
 * @returns The annotated users, whether more can be fetched, and a function to fetch them
 *
 * @example Who can read this document
 * ```tsx
 * const {data} = useUsersWithGrants({document: docHandle})
 *
 * return (
 *   <ul>
 *     {data.map((user) => (
 *       <li key={user.sanityUserId}>
 *         {user.profile.displayName}
 *         {!user.granted && <span> (no access)</span>}
 *       </li>
 *     ))}
 *   </ul>
 * )
 * ```
 *
 * @example Searching the whole organization, server-side
 * ```tsx
 * const {data} = useUsersWithGrants({
 *   resourceType: 'organization',
 *   organizationId: 'my-org-id',
 *   displayName: query,
 *   sortBy: 'displayName',
 *   document: docHandle,
 * })
 * ```
 *
 * @remarks
 * Reading grants means reading the dataset's `system.group` documents, so this
 * throws for users who can reach the dataset but not its access groups. Without
 * a `document` no groups are read and every user is `granted: true`.
 *
 * An organization audience combined with a `document` costs an extra read.
 * Access groups identify their members by project user id, which only a
 * project users read returns inline, so the project's id map is walked and
 * cached first. Organization members outside the project are `granted: false`.
 */
export function useUsersWithGrants(options?: UseUsersWithGrantsOptions): UsersWithGrantsHookResult {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useUsersWithGrants')

  // The document handle resolves its own resource the way `useDocument` does,
  // so a `resourceName` or a bare `projectId`/`dataset` pair still reaches the
  // dataset whose access groups decide the answer.
  const documentHandle = options?.document
  const document = useNormalizedResourceOptions(documentHandle ?? EMPTY_DOCUMENT)
  const resolvedProjectId = useResolvedProjectId(options)
  const effectiveOptions = useMemo((): UsersWithGrantsOptions | undefined => {
    const withProjectId = withResolvedProjectId(options, resolvedProjectId)
    if (!documentHandle) return withProjectId
    return {...withProjectId, document}
  }, [document, documentHandle, options, resolvedProjectId])

  const {deferredKey, signal, isPending} = useDeferredRequestKey(
    getUsersWithGrantsKey(instance, effectiveOptions),
  )
  const deferred = useMemo(() => parseUsersWithGrantsKey(deferredKey), [deferredKey])

  const {getCurrent, subscribe} = useMemo(
    () => getUsersWithGrantsState(instance, deferred),
    [instance, deferred],
  )

  // If data isn't available yet, suspend rendering until it is. Throwing a
  // promise causes React to show the nearest Suspense fallback.
  if (getCurrent() === undefined) {
    throw resolveUsersWithGrants(instance, {...deferred, signal})
  }

  const {data, hasMore} = useSyncExternalStore(subscribe, getCurrent)!

  const loadMore = useCallback(() => {
    loadMoreUsersWithGrants(instance, effectiveOptions)
  }, [instance, effectiveOptions])

  return {data, hasMore, isPending, loadMore}
}

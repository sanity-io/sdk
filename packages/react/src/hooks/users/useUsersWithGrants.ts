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
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * @public
 * @category Types
 */
export interface UseUsersWithGrantsOptions extends Omit<UsersWithGrantsOptions, 'document'> {
  /**
   * The document to measure each user against. Accepts a `resourceName` on top
   * of the core handle, so it resolves against `<SanityApp>`'s `resources`.
   */
  document: DocumentHandle
}

/**
 * @public
 * @category Types
 */
export interface UsersWithGrantsHookResult {
  /**
   * The users fetched, each carrying whether they can read the document.
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
 * Retrieves a project's users, each annotated with whether they can read a
 * document.
 *
 * Users who cannot are returned with `granted: false` rather than dropped, so a
 * picker can show them as unavailable. Filtering them out here would make
 * pagination misleading: `hasMore` tracks the unfiltered list, so a full page
 * could yield only a handful of visible users.
 *
 * @category Users
 * @param options - The document to measure users against, the batch size, and any search terms
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
 * @example Searching the project, server-side
 * ```tsx
 * const {data} = useUsersWithGrants({
 *   displayName: query,
 *   sortBy: 'displayName',
 *   document: docHandle,
 * })
 * ```
 *
 * @remarks
 * Reading grants means reading the dataset's `system.group` documents, so this
 * throws for users who can reach the dataset but not its access groups.
 *
 * The audience is the document's project, because a dataset's access groups
 * identify their members by project user id, which only a project users read
 * returns inline.
 *
 * A document that does not exist denies everyone: a grant is a filter measured
 * against a document, so there is nothing for anyone to hold.
 */
export function useUsersWithGrants(options: UseUsersWithGrantsOptions): UsersWithGrantsHookResult {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useUsersWithGrants')

  // The document handle resolves its own resource the way `useDocument` does,
  // so a `resourceName` or a bare `projectId`/`dataset` pair still reaches the
  // dataset whose access groups decide the answer.
  const document = useNormalizedResourceOptions(options.document)
  const effectiveOptions = useMemo(
    (): UsersWithGrantsOptions => ({...options, document}),
    [document, options],
  )

  const {deferredKey, signal, isPending} = useDeferredRequestKey(
    getUsersWithGrantsKey(effectiveOptions),
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

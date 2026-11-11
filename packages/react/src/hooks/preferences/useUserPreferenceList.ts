import {
  type PreferenceListKey,
  type UserPreferenceOptions,
  type UserPreferenceList,
  userPreferenceList,
  type UserPreferenceListItem,
  type UserPreferenceListOptions,
} from '@sanity/sdk'
import {useCallback, useState, useTransition} from 'react'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'
import {useSignedInUserId} from './useSignedInUserId'

// Typed by key, as `useUserPreference` is: the cache holds every key's list in one type
const useUserPreferenceListFetcher = createFetcherHook(userPreferenceList) as <
  K extends PreferenceListKey,
>(
  userId: string,
  key: K,
  options?: UserPreferenceListOptions,
) => FetcherHookResult<UserPreferenceList<K>>

/**
 * What {@link useUserPreferenceList} returns.
 * @beta
 */
export interface UserPreferenceListResult<K extends PreferenceListKey> extends Omit<
  FetcherHookResult<UserPreferenceList<K>>,
  'data'
> {
  /** The items on the pages read so far, in order. */
  data: UserPreferenceListItem<K>[]
  /** Whether there's another page to read. */
  hasMore: boolean
  /** Whether the next page is being read. */
  isPending: boolean
  /** Reads the next page. */
  loadMore: () => void
}

/**
 * Reads the signed-in user's items for a key, like their saved queries, a page at a time.
 * Suspends until the user and the first page are known; `loadMore` adds the next page while the
 * list stays on screen. After a change, every page read so far is read again from the first,
 * so an item never shows twice or goes missing. Without a `projectId`, it uses the project of
 * the nearest resource. Change the items with {@link useUpdateUserPreferenceList}.
 *
 * @example
 * ```tsx
 * const {data, hasMore, loadMore} = useUserPreferenceList('studio.vision-tool.saved-queries')
 * return (
 *   <>
 *     {data.map(({itemId, value}) => <li key={itemId}>{value.title ?? value.url}</li>)}
 *     {hasMore && <button onClick={loadMore}>Load more</button>}
 *   </>
 * )
 * ```
 * @beta
 */
export function useUserPreferenceList<K extends PreferenceListKey>(
  key: K,
  options?: UserPreferenceOptions<K>,
): UserPreferenceListResult<K> {
  const userId = useSignedInUserId()
  const projectId = useResolvedProjectId({projectId: options?.projectId})
  const [loaded, setLoaded] = useState({key, projectId, pages: 1})
  // Another list starts again from its first page, as `useDocuments` does
  const pages = loaded.key === key && loaded.projectId === projectId ? loaded.pages : 1
  const [isPending, startTransition] = useTransition()
  const {data, ...list} = useUserPreferenceListFetcher(userId, key, {
    ...options,
    projectId,
    pages,
  })
  // A transition, so the pages already read stay on screen while the next one loads
  const loadMore = useCallback(
    () => startTransition(() => setLoaded({key, projectId, pages: pages + 1})),
    [key, projectId, pages],
  )
  return {...list, data: data.data, hasMore: data.hasMore, isPending, loadMore}
}

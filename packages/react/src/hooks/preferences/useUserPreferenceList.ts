import {
  type PreferenceListKey,
  userPreferenceList,
  type UserPreferenceListItem,
  type UserPreferenceListPage,
  type UserPreferenceOptions,
} from '@sanity/sdk'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {
  createPagedFetcherHook,
  type PagedFetcherHookResult,
} from '../helpers/createPagedFetcherHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'
import {useSignedInUserId} from './useSignedInUserId'

// Typed by key, as `useUserPreference` is: the cache holds every key's list in one type
const useUserPreferenceListFetcher = createPagedFetcherHook(userPreferenceList) as <
  K extends PreferenceListKey,
>(
  userId: string,
  key: K,
  options?: UserPreferenceOptions,
) => PagedFetcherHookResult<UserPreferenceListPage<K>>

/**
 * What {@link useUserPreferenceList} returns.
 * @beta
 */
export interface UserPreferenceListResult<K extends PreferenceListKey> extends Omit<
  FetcherHookResult<UserPreferenceListPage<K>>,
  'data'
> {
  /** The items on the pages read so far, in order. */
  data: UserPreferenceListItem<K>[]
  /** Whether there's another page to read. */
  hasMore: boolean
  /** Whether the next page is being read. */
  isPending: boolean
  /** Reads the next page. A failure shows on `error`, keeping the items read so far. */
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
 * const {data, hasMore, isPending, loadMore} = useUserPreferenceList(
 *   'studio.vision-tool.saved-queries',
 * )
 * return (
 *   <>
 *     {data.map(({itemId, value}) => <li key={itemId}>{value.title ?? value.url}</li>)}
 *     {hasMore && <button onClick={loadMore} disabled={isPending}>Load more</button>}
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
  const {data, ...list} = useUserPreferenceListFetcher(userId, key, {...options, projectId})
  return {...list, data: data.data}
}

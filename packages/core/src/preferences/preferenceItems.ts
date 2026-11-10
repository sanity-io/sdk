import {defer, EMPTY, expand, reduce, take} from 'rxjs'

import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher, defineMutation} from '../store/fetcherStore'
import {REFETCH_INTERVAL_MS, request, resolveKey, type UserPreferenceOptions} from './preferences'
import {
  type PreferenceListItemKeyValue,
  type PreferenceListItemValue,
  type PreferenceListKey,
} from './registry'

/**
 * One item, like a saved query.
 * @internal
 */
export interface UserPreferenceListItem<K extends PreferenceListKey = PreferenceListKey> {
  itemId: string
  value: PreferenceListItemValue<K>
  addedAt: string
  updatedAt: string
}

/**
 * The items on the pages read so far, in order.
 * @internal
 */
export interface UserPreferenceList<K extends PreferenceListKey = PreferenceListKey> {
  data: UserPreferenceListItem<K>[]
  /** Whether there's another page to read. */
  hasMore: boolean
}

/**
 * Where items are read from, as for any preference, and how many pages.
 * @internal
 */
export type UserPreferenceListOptions = UserPreferenceOptions & {
  /** How many pages to read, from the first. 1 by default. */
  pages?: number
}

// One page of items, as the API answers
interface ApiPage {
  data: UserPreferenceListItem[]
  nextCursor: string | null
}

/**
 * Input for {@link updateUserPreferenceListItem}: the item's ID and its new value, or `undefined`
 * to remove it.
 * @internal
 */
export type UpdateUserPreferenceListItemInput<K extends PreferenceListKey = PreferenceListKey> =
  UserPreferenceOptions<K> & {
    key: K
    itemId: string
    value: PreferenceListItemValue<K> | undefined
    /** The signed-in user, whose cached lists are read again once the API answers. */
    userId: string
  }

type SetUserPreferenceListItemInput = PreferenceListItemKeyValue &
  UserPreferenceOptions & {itemId: string; userId: string}

type RemoveUserPreferenceListItemInput = UserPreferenceOptions & {
  key: PreferenceListKey
  itemId: string
  userId: string
}

function itemUrl(keyUrl: string, itemId: string) {
  return `${keyUrl}/items/${encodeURIComponent(itemId)}`
}

// Every cached list of a user's items for a key, so a change refetches them all
function itemsTag(userId: string, key: PreferenceListKey) {
  return [{type: 'userPreferenceList', id: `${userId}:${key}`}]
}

/**
 * Fetcher for the signed-in user's items for a key, like their saved queries, on the shared
 * fetcher cache. Reads `pages` pages in order, from the first, so a change, which reads them all
 * again, never shows an item twice or misses one that moved to another page. Lists are cached
 * per user, so people who share a browser never see each other's.
 *
 * @internal
 */
export const userPreferenceList = defineFetcher<
  [userId: string, key: PreferenceListKey, options?: UserPreferenceListOptions],
  UserPreferenceList
>({
  name: 'userPreferenceList',
  getKey: (instance, userId, key, {pages = 1, ...options} = {}) =>
    `${userId}:${resolveKey(instance, key, options).keyUrl}:${pages}`,
  fetch:
    (instance) =>
    (_userId, key, {pages = 1, ...options} = {}) => {
      const url = `${resolveKey(instance, key, options).keyUrl}/items`
      // The client stays open, so each read ends on its answer for `reduce` to emit
      const read = (cursor?: string) =>
        request<ApiPage>(instance, {
          url,
          query: cursor ? {cursor} : {},
          tag: 'preferences.items.list',
        }).pipe(take(1))
      return read().pipe(
        // The API's cursor points at an item, so each page is read with the one before's
        expand((page, index) =>
          page.nextCursor && index + 1 < pages ? read(page.nextCursor) : EMPTY,
        ),
        reduce<ApiPage, UserPreferenceList>(
          (list, page) => ({data: [...list.data, ...page.data], hasMore: page.nextCursor !== null}),
          {data: [], hasMore: false},
        ),
      )
    },
  refetchInterval: REFETCH_INTERVAL_MS,
  tags: (_data, userId, key) => itemsTag(userId, key),
})

// Adds an item, or replaces the item with the same ID
const setUserPreferenceListItem = defineMutation<
  SetUserPreferenceListItemInput,
  UserPreferenceListItem
>({
  name: 'setUserPreferenceListItem',
  mutationFn:
    (instance) =>
    ({userId: _userId, key, itemId, value, ...options}) =>
      // Deferred, so a key that can't be resolved rejects the call rather than throwing
      defer(() =>
        request<UserPreferenceListItem>(instance, {
          url: itemUrl(resolveKey(instance, key, options).keyUrl, itemId),
          method: 'PUT',
          body: {value},
          tag: 'preferences.items.set',
        }),
      ),
  invalidates: (_item, {userId, key}) => itemsTag(userId, key),
})

// Removes an item. Succeeds when there was no such item
const removeUserPreferenceListItem = defineMutation<RemoveUserPreferenceListItemInput, void>({
  name: 'removeUserPreferenceListItem',
  mutationFn:
    (instance) =>
    ({userId: _userId, key, itemId, ...options}) =>
      defer(() =>
        request<void>(instance, {
          url: itemUrl(resolveKey(instance, key, options).keyUrl, itemId),
          method: 'DELETE',
          tag: 'preferences.items.remove',
        }),
      ),
  invalidates: (_result, {userId, key}) => itemsTag(userId, key),
})

/**
 * Saves one of the signed-in user's items for a key, like a saved query, or replaces the item with
 * the same ID; `undefined` removes it, and succeeds when there was no such item. The key's cached
 * lists are read again, from the first page, once the API answers. Rejects with a
 * {@link PreferenceError} when the API refuses.
 *
 * @internal
 */
export async function updateUserPreferenceListItem<K extends PreferenceListKey>(
  instance: SanityInstance,
  {value, ...rest}: UpdateUserPreferenceListItemInput<K>,
): Promise<void> {
  // The options a generic `K` takes aren't known here; every key's are one of these
  const input = rest as Omit<RemoveUserPreferenceListItemInput, 'key'> & {key: K}
  if (value === undefined) {
    await removeUserPreferenceListItem(instance, input)
  } else {
    // `PreferenceListItemKeyValue` pairs each key with its item type, which a generic `K` can't
    // narrow to
    await setUserPreferenceListItem(instance, {...input, value} as SetUserPreferenceListItemInput)
  }
}

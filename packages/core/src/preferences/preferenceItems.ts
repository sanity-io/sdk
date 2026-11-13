import {defer} from 'rxjs'

import {type SanityInstance} from '../store/createSanityInstance'
import {defineMutation, definePagedFetcher} from '../store/fetcherStore'
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
 * One page of items, as the API answers.
 * @internal
 */
export interface UserPreferenceListPage<K extends PreferenceListKey = PreferenceListKey> {
  data: UserPreferenceListItem<K>[]
  /** Where the next page starts, or `null` on the last page. */
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

// An item's saves and removals are sent one at a time, so the server keeps the last one made
function itemScope({userId, key, itemId}: RemoveUserPreferenceListItemInput) {
  return `preferenceItem:${userId}:${key}:${itemId}`
}

// Every cached list of a user's items for a key, so a change refetches them all
function itemsTag(userId: string, key: PreferenceListKey) {
  return [{type: 'userPreferenceList', id: `${userId}:${key}`}]
}

/**
 * Fetcher for the signed-in user's items for a key, like their saved queries, on the shared
 * fetcher cache, a page at a time. After a change, every page read so far is read again from the
 * first, so an item never shows twice or goes missing when it moves to another page. Lists are
 * cached per user, so people who share a browser never see each other's.
 *
 * @internal
 */
export const userPreferenceList = definePagedFetcher<
  [userId: string, key: PreferenceListKey, options?: UserPreferenceOptions],
  UserPreferenceListPage
>({
  name: 'userPreferenceList',
  getKey: (instance, userId, key, options = {}) =>
    `${userId}:${resolveKey(instance, key, options).keyUrl}`,
  fetch:
    (instance) =>
    (cursor, _userId, key, options = {}) =>
      request<UserPreferenceListPage>(instance, {
        url: `${resolveKey(instance, key, options).keyUrl}/items`,
        query: cursor ? {cursor} : {},
        tag: 'preferences.items.list',
      }),
  refetchInterval: REFETCH_INTERVAL_MS,
  tags: (_data, userId, key) => itemsTag(userId, key),
})

// Adds an item, or replaces the item with the same ID
const setUserPreferenceListItem = defineMutation<
  SetUserPreferenceListItemInput,
  UserPreferenceListItem
>({
  name: 'setUserPreferenceListItem',
  scope: itemScope,
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
  scope: itemScope,
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

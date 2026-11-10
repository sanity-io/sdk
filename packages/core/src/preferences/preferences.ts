import {catchError, defer, map, type Observable, switchMap, tap, throwError} from 'rxjs'

import {getDefaultStorage} from '../auth/utils'
import {getClientState} from '../client/clientStore'
import {isDatasetResource} from '../config/sanityConfig'
import {getDashboardOrganizationId} from '../dashboard/messageBus/topicStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher, defineMutation} from '../store/fetcherStore'
import {isDeepEqual, isObject} from '../utils/object'
import {PreferenceError, toPreferenceError} from './preferenceError'
import {
  lookUpKey,
  type PreferenceEdit,
  type PreferenceKey,
  type PreferenceKeyValue,
  type PreferenceLevel,
  type PreferenceListItem,
  type PreferenceResourceType,
  type PreferenceResourceTypeOf,
  type PreferenceValue,
} from './registry'

const API_VERSION = '2026-11-07'
// Another tab's change shows here within this long; a reload or remount shows it at once
const REFETCH_INTERVAL_MS = 60_000
// The client's default is 5 minutes, which a hung write's value would stay on screen for
const REQUEST_TIMEOUT_MS = 10_000

/**
 * A preference of the signed-in user, and where its value comes from: their own value, or the
 * key's default when they haven't set one.
 * @internal
 */
export type UserPreference<K extends PreferenceKey = PreferenceKey> = {
  key: K
  /** The user's value, or the key's default when they haven't set one. */
  value: PreferenceValue<K>
} & (
  | {
      /** The user hasn't set a value, so `value` is the key's default. */
      isDefault: true
      resourceType?: undefined
    }
  | {
      isDefault: false
      /**
       * The kind of resource the user's value is stored in, like the project for a pane's layout.
       * Missing for a value that applies everywhere, like the user's starred projects.
       */
      resourceType?: PreferenceResourceType
    }
)

/**
 * Reads and writes a key in a project. The key's other resource IDs can't be passed.
 * @internal
 */
export interface UserPreferenceProjectOptions {
  /** The key is stored per project. */
  resourceType?: 'project'
  /** The project to use. Without it, the project of the app's resource. */
  projectId?: string
  organizationId?: never
}

/**
 * Reads and writes a key in an organization. The key's other resource IDs can't be passed.
 * @internal
 */
export interface UserPreferenceOrganizationOptions {
  /** The key is stored per organization. */
  resourceType?: 'organization'
  /** The organization to use. Without it, the Dashboard's organization, or the app's. */
  organizationId?: string
  projectId?: never
}

/**
 * Reads and writes a key stored on the user alone, like their starred projects, which applies
 * everywhere. It takes no resource.
 * @internal
 */
export interface UserPreferenceUserOptions {
  resourceType?: never
  projectId?: never
  organizationId?: never
}

/**
 * Where a call reads and writes a key, as the options it takes. A key only takes the options of
 * the resource it's stored in: a key stored per project takes a `projectId`, one stored per
 * organization an `organizationId`, and one stored on the user alone none. Without an ID, the call
 * uses the app's.
 * @internal
 */
export type UserPreferenceOptions<K extends PreferenceKey = PreferenceKey> =
  // Code that handles any key, like the shared cache, can pass any of them
  PreferenceKey extends K
    ? {resourceType?: PreferenceResourceType; projectId?: string; organizationId?: string}
    : [PreferenceResourceTypeOf<K>] extends [never]
      ? UserPreferenceUserOptions
      : PreferenceResourceTypeOf<K> extends 'project'
        ? UserPreferenceProjectOptions
        : UserPreferenceOrganizationOptions

/**
 * Input for {@link updateUserPreference}: the key and its next value, for the given user.
 * @internal
 */
export type UpdateUserPreferenceInput<K extends PreferenceKey = PreferenceKey> =
  UserPreferenceOptions<K> & {
    key: K
    value: PreferenceEdit<K>
    /** Part of the cache key, so people who share a browser never see each other's values. */
    userId: string
  }

type SetUserPreferenceInput = PreferenceKeyValue & UserPreferenceOptions & {userId: string}

type ResetUserPreferenceInput = UserPreferenceOptions & {key: PreferenceKey; userId: string}

type ChangeUserPreferenceListInput = UserPreferenceOptions & {
  key: PreferenceKey
  add: PreferenceListItem[]
  /** Where new items go; items already in the list are updated where they are */
  at: 'start' | 'end'
  /** The `ref`s of the items to remove */
  remove: string[]
  userId: string
}

// The API's answer for one key
interface ApiPreference {
  key: string
  activeValue: unknown
  activeLevel: PreferenceLevel
}

// Where the signed-in user's own values for a key live: per project, per organization, or on the
// user alone
function resolveKey(instance: SanityInstance, key: string, options: UserPreferenceOptions = {}) {
  const {resourceType, defaultValue} = lookUpKey(key)
  let path = '/users/me/preferences'
  if (resourceType !== 'user') {
    const {resource} = instance.config
    const resourceId =
      resourceType === 'project'
        ? (options.projectId ??
          (resource && isDatasetResource(resource)
            ? resource.projectId
            : instance.config.projectId))
        : (options.organizationId ??
          getDashboardOrganizationId(instance).getCurrent() ??
          instance.config.organizationId)
    if (!resourceId) {
      throw new PreferenceError(
        'levelNotAllowed',
        `"${key}" is stored per ${resourceType}, and this call has no ${resourceType} ID. Pass \`${resourceType}Id\`, or set one in the app's config.`,
      )
    }
    path = `/${resourceType}s/${encodeURIComponent(resourceId)}${path}`
  }
  return {path, keyUrl: `${path}/${encodeURIComponent(key)}`, defaultValue}
}

// Where a write stores the user's own value, so it shows there at once
function ownSource(key: string) {
  const {resourceType} = lookUpKey(key)
  return {isDefault: false, ...(resourceType !== 'user' && {resourceType})} as const
}

function toPreference(response: ApiPreference, defaultValue: unknown): UserPreference {
  // The registry types each key's value; the API's answer is `unknown`
  const {key, activeValue, activeLevel} = response
  const value = activeValue ?? defaultValue
  if (activeLevel === 'default') return {key, value, isDefault: true} as UserPreference
  // `user@project` is the user's own value in a project; `user` alone applies everywhere
  const [, resourceType] = activeLevel.split('@')
  return {key, value, isDefault: false, ...(resourceType && {resourceType})} as UserPreference
}

// Cached per user, so a value shows straight away on the next visit
function storageKey(userId: string, keyUrl: string) {
  return `sanity-preferences:v1:${userId}:${keyUrl}`
}

function readCachedPreference(userId: string, keyUrl: string): UserPreference | undefined {
  try {
    const raw = getDefaultStorage()?.getItem(storageKey(userId, keyUrl))
    const cached: unknown = raw ? JSON.parse(raw) : undefined
    if (!isObject(cached) || !('key' in cached) || typeof cached.key !== 'string') return undefined
    if (!('isDefault' in cached) || typeof cached.isDefault !== 'boolean') return undefined
    return cached as UserPreference
  } catch {
    // Storage throws in some private modes; a miss only costs the head start
    return undefined
  }
}

function cachePreference(userId: string, keyUrl: string, preference: UserPreference) {
  try {
    getDefaultStorage()?.setItem(storageKey(userId, keyUrl), JSON.stringify(preference))
  } catch {
    // A full or blocked storage only costs the next visit its head start
  }
}

function request<T>(
  instance: SanityInstance,
  options: {
    url: string
    method?: 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    query?: {keys: string}
    tag: string
  },
): Observable<T> {
  return getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
    switchMap((client) => client.observable.request<T>({...options, timeout: REQUEST_TIMEOUT_MS})),
    catchError((error: unknown) => throwError(() => toPreferenceError(error))),
  )
}

// Sends a write and caches the API's answer. Deferred, so a key that can't be resolved rejects the
// call rather than throwing before it starts
function sendWrite(
  instance: SanityInstance,
  userId: string,
  key: PreferenceKey,
  options: UserPreferenceOptions,
  change: {method: 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; tag: string},
): Observable<UserPreference> {
  return defer(() => {
    const {keyUrl, defaultValue} = resolveKey(instance, key, options)
    return request<ApiPreference>(instance, {url: keyUrl, ...change}).pipe(
      map((response) => toPreference(response, defaultValue)),
      tap((stored) => cachePreference(userId, keyUrl, stored)),
    )
  })
}

/**
 * Fetcher for one preference of the signed-in user, on the shared fetcher cache. It starts from
 * the value cached on the user's last visit, when there is one, and reads the API in the
 * background.
 *
 * @internal
 */
export const userPreference = defineFetcher<
  [userId: string, key: PreferenceKey, options?: UserPreferenceOptions],
  UserPreference
>({
  name: 'userPreference',
  getKey: (instance, userId, key, options) =>
    `${userId}:${resolveKey(instance, key, options).keyUrl}`,
  initialData: (instance, userId, key, options) => {
    const cached = readCachedPreference(userId, resolveKey(instance, key, options).keyUrl)
    // From an earlier visit, so it counts as stale and is read again straight away
    return cached ? {data: cached, dataUpdatedAt: 0} : undefined
  },
  refetchInterval: REFETCH_INTERVAL_MS,
  fetch: (instance) => (userId, key, options) => {
    const {path, keyUrl, defaultValue} = resolveKey(instance, key, options)
    return request<{data: ApiPreference[]}>(instance, {
      url: path,
      query: {keys: key},
      tag: 'preferences.get',
    }).pipe(
      map(({data}) => {
        const response = data.find((candidate) => candidate.key === key)
        if (response) return toPreference(response, defaultValue)
        throw new PreferenceError(
          'keyNotDeclared',
          `The preferences API doesn't know "${key}". It may have been renamed or removed; update @sanity/sdk to get the current keys.`,
        )
      }),
      tap((fetched) => cachePreference(userId, keyUrl, fetched)),
    )
  },
})

// Stores a value. It shows in the cached `userPreference` at once, and is rolled back when the API
// refuses it
const setUserPreference = defineMutation<SetUserPreferenceInput, UserPreference>({
  name: 'setUserPreference',
  mutationFn:
    (instance) =>
    ({userId, key, value, ...options}) =>
      sendWrite(instance, userId, key, options, {
        method: 'PUT',
        body: {value},
        tag: 'preferences.set',
      }),
  onMutate: (write, {userId, key, value, ...options}) => {
    try {
      // The registry types each key's value; the cache holds every key's as `unknown`
      write(userPreference, [userId, key, options], {
        key,
        value,
        ...ownSource(key),
      } as UserPreference)
    } catch {
      // A key that can't be resolved has nothing to show; `mutationFn` rejects with why
    }
  },
  onSuccess: (write, stored, {userId, key, value: _value, ...options}) =>
    write(userPreference, [userId, key, options], stored),
})

// Removes the user's value, so the key's default applies again. The cached `userPreference` changes
// once the API answers: only it knows which value applies next
const resetUserPreference = defineMutation<ResetUserPreferenceInput, UserPreference>({
  name: 'resetUserPreference',
  mutationFn:
    (instance) =>
    ({userId, key, ...options}) =>
      sendWrite(instance, userId, key, options, {method: 'DELETE', tag: 'preferences.reset'}),
  onSuccess: (write, stored, {userId, key, ...options}) =>
    write(userPreference, [userId, key, options], stored),
})

// The list a change starts from: the one read last, or the key's default when it hasn't been read
function listOf(key: string, current: UserPreference | undefined): PreferenceListItem[] {
  // The registry types a list key's value as a list
  return (current?.value ?? lookUpKey(key).defaultValue) as PreferenceListItem[]
}

// Removes and adds a list's items in one request, so the API saves the change whole or not at all.
// The change on screen is worked out from the cached list the way the API does it, so a change
// rolled back before it can't come back with it
const changeUserPreferenceList = defineMutation<ChangeUserPreferenceListInput, UserPreference>({
  name: 'changeUserPreferenceList',
  mutationFn:
    (instance) =>
    ({userId, key, add, at, remove, ...options}) =>
      defer(() => {
        const {path, keyUrl, defaultValue} = resolveKey(instance, key, options)
        const changes = [
          ...(remove.length ? [{key, remove}] : []),
          ...(add.length ? [{key, add, at}] : []),
        ]
        return request<{data: ApiPreference[]}>(instance, {
          url: path,
          method: 'PATCH',
          body: {data: changes},
          tag: 'preferences.list.change',
        }).pipe(
          // One answer per change, each with the list after all of them
          map(({data}) => toPreference(data[0]!, defaultValue)),
          tap((stored) => cachePreference(userId, keyUrl, stored)),
        )
      }),
  onMutate: (write, {userId, key, add, at, remove, ...options}) => {
    try {
      const source = ownSource(key)
      write(userPreference, [userId, key, options], (current) => {
        // The same as the API: items already in the list are updated where they are
        const byRef = new Map(add.map((item) => [item.ref, item]))
        const kept = listOf(key, current)
          .filter((item) => !remove.includes(item.ref))
          .map((item) => byRef.get(item.ref) ?? item)
        const existing = new Set(kept.map((item) => item.ref))
        const added = add.filter((item) => !existing.has(item.ref))
        const value = at === 'start' ? [...added, ...kept] : [...kept, ...added]
        return {key, value, ...source} as UserPreference
      })
    } catch {
      // A key that can't be resolved has nothing to show; `mutationFn` rejects with why
    }
  },
  onSuccess: (write, stored, {userId, key, add: _add, at: _at, remove: _remove, ...options}) =>
    write(userPreference, [userId, key, options], stored),
})

// The items to remove and add to turn `current` into `next`, or `undefined` when only replacing
// the whole list can: the API adds new items only at the start or the end, and never moves one
function listChange(
  key: string,
  current: PreferenceListItem[],
  next: PreferenceListItem[],
): Pick<ChangeUserPreferenceListInput, 'add' | 'at' | 'remove'> | undefined {
  const refs = next.map((item) => item.ref)
  const repeated = refs.find((ref, index) => refs.indexOf(ref) !== index)
  if (repeated !== undefined) {
    throw new PreferenceError(
      'valueInvalid',
      `"${key}" has the item "${repeated}" more than once. Give each item in a list its own \`ref\`.`,
    )
  }
  const before = new Map(current.map((item) => [item.ref, item]))
  const isNew = (item: PreferenceListItem) => !before.has(item.ref)
  const kept = refs.filter((ref) => before.has(ref))
  const staying = current.map((item) => item.ref).filter((ref) => refs.includes(ref))
  if (kept.some((ref, index) => ref !== staying[index])) return undefined

  const added = next.filter(isNew)
  let at: 'start' | 'end'
  if (next.slice(next.length - added.length).every(isNew)) at = 'end'
  else if (next.slice(0, added.length).every(isNew)) at = 'start'
  else return undefined

  return {
    add: [
      ...next.filter((item) => !isNew(item) && !isDeepEqual(item, before.get(item.ref))),
      ...added,
    ],
    at,
    remove: current.filter((item) => !refs.includes(item.ref)).map((item) => item.ref),
  }
}

/**
 * Changes a preference of the signed-in user. A value stores it, and shows at once in the cached
 * {@link userPreference}; `undefined` removes the user's value, so the key's default applies once
 * the API answers. A function gets the value on screen, changes still on their way included, and
 * returns the next one. For a list, only the items removed and added are sent, so a change made
 * elsewhere in the meantime is kept; a reorder replaces the whole list. Resolves with the
 * preference the API stored, and rejects with a {@link PreferenceError} when it refuses, after the
 * value on screen goes back.
 *
 * @internal
 */
export async function updateUserPreference<K extends PreferenceKey>(
  instance: SanityInstance,
  {userId, key, value, ...rest}: UpdateUserPreferenceInput<K>,
): Promise<UserPreference<K>> {
  // The options a generic `K` takes aren't known here; every key's are one of these
  const options = rest as UserPreferenceOptions
  const {list} = lookUpKey(key)
  let current: UserPreference | undefined
  if (list || typeof value === 'function') {
    // Read first when nothing is cached, so a function or a list's difference starts from what's
    // stored, not the default
    current =
      userPreference.getState(instance, userId, key, options).getCurrent().data ??
      (await userPreference.resolveState(instance, userId, key, options))
  }
  const next: unknown =
    typeof value === 'function' ? value(current?.value as PreferenceValue<K>) : value

  let written
  if (next === undefined) {
    written = resetUserPreference(instance, {userId, key, ...options})
  } else {
    const change = list
      ? listChange(key, current?.value as PreferenceListItem[], next as PreferenceListItem[])
      : undefined
    if (change && !change.add.length && !change.remove.length) {
      return current as unknown as UserPreference<K>
    }
    written = change
      ? changeUserPreferenceList(instance, {userId, key, ...change, ...options})
      : // `PreferenceKeyValue` pairs each key with its value type, which a generic `K` can't narrow to
        setUserPreference(instance, {
          userId,
          key,
          value: next,
          ...options,
        } as SetUserPreferenceInput)
  }
  // The registry types each key's value; the cache holds every key's in one type
  return (await written).data as unknown as UserPreference<K>
}

import {catchError, defer, map, type Observable, switchMap, tap, throwError} from 'rxjs'

import {getDefaultStorage} from '../auth/utils'
import {getClientState} from '../client/clientStore'
import {isDatasetResource} from '../config/sanityConfig'
import {getDashboardOrganizationId} from '../dashboard/messageBus/topicStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher, defineMutation} from '../store/fetcherStore'
import {isObject} from '../utils/object'
import {PreferenceError, toPreferenceError} from './preferenceError'
import {
  lookUpKey,
  type PreferenceEdit,
  type PreferenceKey,
  type PreferenceKeyValue,
  type PreferenceLevel,
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
 * A preference of the signed-in user, and where its value comes from: their own value in a
 * project or organization, or the key's default when they haven't set one.
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
      /** The kind of resource the user's value is stored in, like the project for a pane's layout. */
      resourceType: PreferenceResourceType
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
 * Where a call reads and writes a key, as the options it takes. A key only takes the options of
 * the resource it's stored in: a key stored per project takes a `projectId`, and one stored per
 * organization an `organizationId`. Without an ID, the call uses the app's.
 * @internal
 */
export type UserPreferenceOptions<K extends PreferenceKey = PreferenceKey> =
  // Code that handles any key, like the shared cache, can pass any of them
  PreferenceKey extends K
    ? {resourceType?: PreferenceResourceType; projectId?: string; organizationId?: string}
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

// The API's answer for one key
interface ApiPreference {
  key: string
  activeValue: unknown
  activeLevel: PreferenceLevel
}

// Where the signed-in user's own values for a key live: per project or per organization
function resolveKey(instance: SanityInstance, key: string, options: UserPreferenceOptions = {}) {
  const {resourceType, defaultValue} = lookUpKey(key)
  const {resource} = instance.config
  const resourceId =
    resourceType === 'project'
      ? (options.projectId ??
        (resource && isDatasetResource(resource) ? resource.projectId : instance.config.projectId))
      : (options.organizationId ??
        getDashboardOrganizationId(instance).getCurrent() ??
        instance.config.organizationId)
  if (!resourceId) {
    throw new PreferenceError(
      'levelNotAllowed',
      `"${key}" is stored per ${resourceType}, and this call has no ${resourceType} ID. Pass \`${resourceType}Id\`, or set one in the app's config.`,
    )
  }
  const path = `/${resourceType}s/${encodeURIComponent(resourceId)}/users/me/preferences`
  return {path, keyUrl: `${path}/${encodeURIComponent(key)}`, defaultValue}
}

function toPreference(response: ApiPreference, defaultValue: unknown): UserPreference {
  // The registry types each key's value; the API's answer is `unknown`
  const {key, activeValue, activeLevel} = response
  const value = activeValue ?? defaultValue
  return (
    activeLevel === 'default'
      ? {key, value, isDefault: true}
      : {key, value, isDefault: false, resourceType: activeLevel.slice('user@'.length)}
  ) as UserPreference
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
    method?: 'PUT' | 'DELETE'
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
  change: {method: 'PUT' | 'DELETE'; body?: unknown; tag: string},
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
        isDefault: false,
        resourceType: lookUpKey(key).resourceType,
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

/**
 * Changes a preference of the signed-in user. A value stores it, and shows at once in the cached
 * {@link userPreference}; `undefined` removes the user's value, so the key's default applies once
 * the API answers. A function gets the value on screen, changes still on their way included, and
 * returns the next one. Resolves with the preference the API stored, and rejects with a
 * {@link PreferenceError} when it refuses, after the value on screen goes back.
 *
 * @internal
 */
export async function updateUserPreference<K extends PreferenceKey>(
  instance: SanityInstance,
  {userId, key, value, ...rest}: UpdateUserPreferenceInput<K>,
): Promise<UserPreference<K>> {
  // The options a generic `K` takes aren't known here; every key's are one of these
  const options = rest as UserPreferenceOptions
  let next: unknown = value
  if (typeof value === 'function') {
    // Read first when nothing is cached, so the function gets what's stored, not the default
    const current =
      userPreference.getState(instance, userId, key, options).getCurrent().data ??
      (await userPreference.resolveState(instance, userId, key, options))
    next = value(current.value as PreferenceValue<K>)
  }
  const {data} =
    next === undefined
      ? await resetUserPreference(instance, {userId, key, ...options})
      : // `PreferenceKeyValue` pairs each key with its value type, which a generic `K` can't narrow to
        await setUserPreference(instance, {
          userId,
          key,
          value: next,
          ...options,
        } as SetUserPreferenceInput)
  // The registry types each key's value; the cache holds every key's in one type
  return data as unknown as UserPreference<K>
}

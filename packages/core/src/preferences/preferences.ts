import {
  catchError,
  defer,
  firstValueFrom,
  map,
  type Observable,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs'

import {getDefaultStorage} from '../auth/utils'
import {getClientState} from '../client/clientStore'
import {isDatasetResource} from '../config/sanityConfig'
import {getDashboardMessageBus} from '../dashboard/messageBus/store'
import {getDashboardOrganizationId, getTopicState} from '../dashboard/messageBus/topicStore'
import {observeAppOrganizationId} from '../organization/appOrganization'
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
  type PreferenceLevelsOf,
  type PreferenceListItem,
  type PreferenceListKey,
  type PreferenceResourceType,
  type PreferenceValue,
  type StoredLevel,
} from './registry'

const API_VERSION = '2026-11-07'
/**
 * Another tab's change shows here within this long; a reload or remount shows it at once.
 * @internal
 */
export const REFETCH_INTERVAL_MS = 60_000
// The client's default is 5 minutes, which a hung write's value would stay on screen for
const REQUEST_TIMEOUT_MS = 10_000

/**
 * A preference of the signed-in user, and where its value comes from: their own value, the value
 * everyone in their project or organization shares, or the key's default.
 * @internal
 */
export type UserPreference<K extends PreferenceKey = PreferenceKey> = {
  key: K
  /**
   * The value in effect: the user's own, then the one their project or organization shares, then
   * the key's default.
   */
  value: PreferenceValue<K>
  /**
   * Whether the user can change the value where the call writes it: their own, or with `shared`
   * the shared one. `undefined` until the API answers; a value cached from the user's last visit
   * keeps that visit's answer.
   */
  canEdit: boolean | undefined
} & (
  | {
      /** Nobody has set a value, so `value` is the key's default. */
      isDefault: true
      /** The default isn't anyone's value. */
      shared: false
      resourceType?: undefined
    }
  | {
      isDefault: false
      /** `value` is the user's own. */
      shared: false
      /**
       * The kind of resource the user's value is stored in, like the project for a pane's layout.
       * Missing for a value that applies everywhere, like the user's starred projects.
       */
      resourceType?: PreferenceResourceType
    }
  | {
      isDefault: false
      /** `value` is the one everyone in the project or organization shares. */
      shared: true
      /** The kind of resource whose members share the value. */
      resourceType: PreferenceResourceType
    }
)

/**
 * Picks the user's own value or the shared one, and whether a call has to name the kind of
 * resource. A key stored in both projects and organizations has to name it; one stored in only one
 * kind can leave it out.
 */
type ResourceOptions<
  R extends PreferenceResourceType,
  Shared extends boolean,
  Named extends boolean,
> = (Named extends true
  ? {
      /**
       * The kind of resource to read and write. The key is stored in more than one, so a call
       * names it.
       */
      resourceType: R
    }
  : {
      /**
       * The kind of resource to read and write. The key is stored in only this one, so it can be
       * left out.
       */
      resourceType?: R
    }) &
  (Shared extends true
    ? {
        /** Reads and writes the value everyone in the resource shares, instead of the user's own. */
        shared: true
      }
    : {
        /**
         * Reads and writes the user's own value. Leave it out, or pass `true` for the shared value
         * where the key has one.
         */
        shared?: false
      })

/**
 * Reads and writes a key in a project: the user's own value, or with `shared` the one everyone in
 * the project shares.
 * @internal
 */
export type UserPreferenceProjectOptions<
  Shared extends boolean = boolean,
  Named extends boolean = boolean,
> = ResourceOptions<'project', Shared, Named> & {
  /** The project to use. Without it, the project of the app's resource. */
  projectId?: string
  organizationId?: never
}

/**
 * Reads and writes a key in an organization: the user's own value, or with `shared` the one
 * everyone in the organization shares.
 * @internal
 */
export type UserPreferenceOrganizationOptions<
  Shared extends boolean = boolean,
  Named extends boolean = boolean,
> = ResourceOptions<'organization', Shared, Named> & {
  /** The organization to use. Without it, the Dashboard's organization, or the app's. */
  organizationId?: string
  projectId?: never
}

/**
 * Reads and writes a key stored on the user alone, like their starred projects, which applies
 * everywhere. It takes no resource, and has no shared value.
 * @internal
 */
export interface UserPreferenceUserOptions {
  resourceType?: never
  projectId?: never
  organizationId?: never
  shared?: false
}

// Whether a key stores this kind of value in both projects and organizations
type InBoth<Levels, Project, Organization> = [Project] extends [Levels]
  ? [Organization] extends [Levels]
    ? true
    : false
  : false

// The options for one level a key is stored at; `Levels` is all of them
type OptionsAt<L extends StoredLevel, Levels extends StoredLevel> = L extends 'user'
  ? UserPreferenceUserOptions
  : L extends 'user@project'
    ? UserPreferenceProjectOptions<false, InBoth<Levels, 'user@project', 'user@organization'>>
    : L extends 'user@organization'
      ? UserPreferenceOrganizationOptions<
          false,
          InBoth<Levels, 'user@project', 'user@organization'>
        >
      : L extends 'project'
        ? UserPreferenceProjectOptions<true, InBoth<Levels, 'project', 'organization'>>
        : UserPreferenceOrganizationOptions<true, InBoth<Levels, 'project', 'organization'>>

/**
 * Where a call reads and writes a key, as the options it takes. A key only takes the options of
 * the places it's stored: a key stored per project takes a `projectId`, one stored per organization
 * an `organizationId`, and one stored on the user alone none. `shared: true` reads and writes the
 * value everyone in the resource shares, for keys that have one. Without an ID, the call uses the
 * app's.
 * @internal
 */
export type UserPreferenceOptions<K extends PreferenceKey | PreferenceListKey = PreferenceKey> =
  // Code that handles any key, like the shared cache, can pass any of them
  PreferenceKey extends K
    ? {
        resourceType?: PreferenceResourceType
        projectId?: string
        organizationId?: string
        shared?: boolean
      }
    : OptionsAt<PreferenceLevelsOf<K>, PreferenceLevelsOf<K>>

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
  canEdit?: boolean
}

const RESOURCE_TYPES = ['project', 'organization'] as const

// The call's ID for a resource, or else the app's: its resource's project, or the Dashboard's
// organization
function resourceIdFor(
  instance: SanityInstance,
  type: (typeof RESOURCE_TYPES)[number],
  options: UserPreferenceOptions,
) {
  if (type === 'organization') {
    return (
      options.organizationId ??
      getDashboardOrganizationId(instance).getCurrent() ??
      instance.config.organizationId
    )
  }
  const {resource} = instance.config
  return (
    options.projectId ??
    (resource && isDatasetResource(resource) ? resource.projectId : instance.config.projectId)
  )
}

// Why a call has nowhere to read or write a key
function levelNotAllowed(key: string, types: readonly string[], shared: boolean) {
  if (types.length) {
    return new PreferenceError(
      'levelNotAllowed',
      `"${key}" is stored per ${types.join(' or ')}, and this call has no ${types.join(' or ')} ID. Pass ${types.map((type) => `\`${type}Id\``).join(' or ')}, or set one in the app's config.`,
    )
  }
  return new PreferenceError(
    'levelNotAllowed',
    shared
      ? `"${key}" has no shared value. Leave out \`shared\` to use the signed-in user's own value.`
      : `"${key}" only has a shared value. Pass \`shared: true\` to read and write it.`,
  )
}

/**
 * Where a call reads and writes a key: the most specific level the key is stored at that the call
 * has an ID for. The user's own value, or with `shared` the one everyone in the resource shares.
 * @internal
 */
export function resolveKey(
  instance: SanityInstance,
  key: string,
  options: UserPreferenceOptions = {},
): {path: string; keyUrl: string; defaultValue: unknown} {
  const {levels, defaultValue} = lookUpKey(key)
  const {shared = false} = options
  const target = (path: string) => ({
    path,
    keyUrl: `${path}/${encodeURIComponent(key)}`,
    defaultValue,
  })
  const types = RESOURCE_TYPES.filter(
    (type) =>
      (!options.resourceType || type === options.resourceType) &&
      levels.includes(shared ? type : `user@${type}`),
  )
  // A call that names an organization means it, even for a key that's also stored per project
  if (options.organizationId) types.reverse()
  const owner = shared ? '' : '/users/me'
  for (const type of types) {
    const resourceId = resourceIdFor(instance, type, options)
    if (resourceId) return target(`/${type}s/${encodeURIComponent(resourceId)}${owner}/preferences`)
  }
  if (!shared && !options.resourceType && levels.includes('user')) {
    return target('/users/me/preferences')
  }
  if (options.resourceType && !types.length) {
    throw new PreferenceError(
      'levelNotAllowed',
      `"${key}" isn't stored per ${options.resourceType}. Leave out \`resourceType\`, or pass one the key is stored in.`,
    )
  }
  throw levelNotAllowed(key, types, shared)
}

// Where a value comes from, from the API's level for it: `user@project` is the user's own value in
// a project, `user` alone applies everywhere, and `project` is the one everyone in it shares
function sourceOf(level: PreferenceLevel) {
  if (level === 'default') return {isDefault: true, shared: false} as const
  const [owner, resourceType] = level.split('@')
  if (owner === 'user')
    return {isDefault: false, shared: false, ...(resourceType && {resourceType})}
  return {isDefault: false, shared: true, resourceType: owner}
}

// Where a write stores its value, so it shows there at once. Without an instance it can't tell
// which resource IDs the call has, so a key stored in two kinds of resource shows the more specific
// one until the API answers
function writeSource(key: string, {shared = false, resourceType}: UserPreferenceOptions) {
  const level = lookUpKey(key).levels.find(
    (stored) =>
      stored.startsWith('user') !== shared && (!resourceType || stored.endsWith(resourceType)),
  )
  return level && sourceOf(level)
}

function toPreference(response: ApiPreference, defaultValue: unknown): UserPreference {
  // The registry types each key's value; the API's answer is `unknown`
  return {
    key: response.key,
    value: response.activeValue ?? defaultValue,
    canEdit: response.canEdit,
    ...sourceOf(response.activeLevel),
  } as UserPreference
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

/**
 * Sends a request to the preferences API. A refusal becomes a {@link PreferenceError}.
 * @internal
 */
export function request<T>(
  instance: SanityInstance,
  options: {
    url: string
    method?: 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    query?: Record<string, string>
    tag: string
  },
): Observable<T> {
  return getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
    switchMap((client) => client.observable.request<T>({...options, timeout: REQUEST_TIMEOUT_MS})),
    catchError((error: unknown) => throwError(() => toPreferenceError(error))),
  )
}

// Sends a write, once the organization it may go to is known, and caches the API's answer.
// Deferred, so a key that can't be resolved rejects the call rather than throwing before it starts.
// A batch goes to the path the key is stored under, which applies its changes in one go
function sendWrite(
  instance: SanityInstance,
  userId: string,
  key: PreferenceKey,
  options: UserPreferenceOptions,
  {
    batch = false,
    ...change
  }: {method: 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; tag: string; batch?: boolean},
): Observable<UserPreference> {
  return defer(() => whenOrganizationKnown(instance, key, options) ?? of(undefined)).pipe(
    switchMap(() => {
      const {path, keyUrl, defaultValue} = resolveKey(instance, key, options)
      return request<ApiPreference | {data: ApiPreference[]}>(instance, {
        url: batch ? path : keyUrl,
        ...change,
      }).pipe(
        // A batch answers with one preference per change, each with the value after all of them
        map((response) =>
          toPreference('data' in response ? response.data[0]! : response, defaultValue),
        ),
        tap((stored) => cachePreference(userId, keyUrl, stored)),
      )
    }),
  )
}

/**
 * Resolves once the Dashboard has published its organization, when a call reads or writes a key
 * there without naming one. Otherwise `undefined`: there's nothing to wait for.
 *
 * @internal
 */
export function whenOrganizationKnown(
  instance: SanityInstance,
  key: PreferenceKey,
  options: UserPreferenceOptions = {},
): Promise<unknown> | undefined {
  const level = options.shared ? 'organization' : 'user@organization'
  if (options.organizationId || options.resourceType === 'project') return undefined
  if (!lookUpKey(key).levels.includes(level)) return undefined
  // Outside a message bus the organization is known from the start, or never
  if (!getDashboardMessageBus(instance)) return undefined
  // `null` is a published "no organization", so only `undefined` is still waiting
  if (getTopicState(instance, 'organizations.current').getCurrent() !== undefined) return undefined
  return firstValueFrom(observeAppOrganizationId(instance))
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
  // A user's own read answers with the shared value when they haven't set one, so a change to the
  // shared value refetches it
  tags: (_data, userId, key, options) =>
    options?.shared ? [] : [{type: 'userPreference', id: `${userId}:${key}`}],
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

// After a change to a shared value, the user's own reads of the key, which may show it
function sharedChange(_result: UserPreference, {userId, key, shared}: ResetUserPreferenceInput) {
  return shared ? [{type: 'userPreference', id: `${userId}:${key}`}] : []
}

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
      const source = writeSource(key, options)
      // The registry types each key's value; the cache holds every key's as `unknown`
      write(
        userPreference,
        [userId, key, options],
        (current) => ({key, value, canEdit: current?.canEdit, ...source}) as UserPreference,
      )
    } catch {
      // A key that can't be resolved yet has nothing to show; `mutationFn` waits for its
      // organization, or rejects with why
    }
  },
  onSuccess: (write, stored, {userId, key, value: _value, ...options}) =>
    write(userPreference, [userId, key, options], stored),
  invalidates: sharedChange,
})

// Removes a value, the user's own or with `shared` the shared one, so the next one in effect
// applies again: the shared value or the key's default. The cached `userPreference` changes once
// the API answers: only it knows which value applies next
const resetUserPreference = defineMutation<ResetUserPreferenceInput, UserPreference>({
  name: 'resetUserPreference',
  mutationFn:
    (instance) =>
    ({userId, key, ...options}) =>
      sendWrite(instance, userId, key, options, {method: 'DELETE', tag: 'preferences.reset'}),
  // Only the API knows which value applies next, so this leaves the value as it is. Writing it
  // still sends the reset in turn with the key's other changes
  onMutate: (write, {userId, key, ...options}) => {
    try {
      write(userPreference, [userId, key, options], (current) => current as UserPreference)
    } catch {
      // A key that can't be resolved has nothing to show; `mutationFn` rejects with why
    }
  },
  onSuccess: (write, stored, {userId, key, ...options}) =>
    write(userPreference, [userId, key, options], stored),
  invalidates: sharedChange,
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
      sendWrite(instance, userId, key, options, {
        method: 'PATCH',
        body: {
          data: [
            ...(remove.length ? [{key, remove}] : []),
            ...(add.length ? [{key, add, at}] : []),
          ],
        },
        tag: 'preferences.list.change',
        batch: true,
      }),
  onMutate: (write, {userId, key, add, at, remove, ...options}) => {
    try {
      const source = writeSource(key, options)
      write(userPreference, [userId, key, options], (current) => {
        // The same as the API: items already in the list are updated where they are
        const byRef = new Map(add.map((item) => [item.ref, item]))
        const kept = listOf(key, current)
          .filter((item) => !remove.includes(item.ref))
          .map((item) => byRef.get(item.ref) ?? item)
        const existing = new Set(kept.map((item) => item.ref))
        const added = add.filter((item) => !existing.has(item.ref))
        const value = at === 'start' ? [...added, ...kept] : [...kept, ...added]
        return {key, value, canEdit: current?.canEdit, ...source} as UserPreference
      })
    } catch {
      // A key that can't be resolved yet has nothing to show; `mutationFn` waits for its
      // organization, or rejects with why
    }
  },
  onSuccess: (write, stored, {userId, key, add: _add, at: _at, remove: _remove, ...options}) =>
    write(userPreference, [userId, key, options], stored),
  invalidates: sharedChange,
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
 * Changes a preference of the signed-in user, or with `shared` the value everyone in the project or
 * organization shares. A value stores it, and shows at once in the cached {@link userPreference};
 * `undefined` removes it, so the next value in effect applies once the API answers: the shared
 * value or the key's default. A function gets the value on screen, changes still on their way
 * included, and returns the next one. For a list, only the items removed and added are sent, so a
 * change made elsewhere in the meantime is kept; a reorder replaces the whole list. Resolves with
 * the preference the API stored, and rejects with a {@link PreferenceError} when it refuses, after
 * the value on screen goes back.
 *
 * @internal
 */
export async function updateUserPreference<K extends PreferenceKey>(
  instance: SanityInstance,
  {userId, key, value, ...rest}: UpdateUserPreferenceInput<K>,
): Promise<UserPreference<K>> {
  // The options a generic `K` takes aren't known here; every key's are one of these
  const options = rest as UserPreferenceOptions
  // The cache key names the organization, so wait for the Dashboard's when the key needs it
  const organization = whenOrganizationKnown(instance, key, options)
  if (organization) await organization
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

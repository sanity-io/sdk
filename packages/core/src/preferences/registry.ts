import {type AccessResourceType} from '../access/checkPermissions'
import {PreferenceError} from './preferenceError'

interface SortOrder {
  by: {
    field: string
    direction: 'asc' | 'desc'
    nulls?: 'first' | 'last'
    [extra: string]: unknown
  }[]
  [extra: string]: unknown
}

/**
 * An item in a list preference, like a starred project. `ref` tells items apart.
 * @internal
 */
export interface PreferenceListItem {
  ref: string
  data?: unknown
}

// The value type of every key the preferences API declares, by the API's name for the key. A
// `{part}` in a name stands for anything, like the pane in `studio.structure-tool.layout.{paneKey}`
interface Values {
  'manage.favorites.projects': PreferenceListItem[]
  'studio.structure-tool.layout.{paneKey}': string
  'studio.structure-tool.sort-order.{paneKey}': SortOrder
  'studio.structure-tool.inspect-view-mode': 'parsed' | 'raw'
  'studio.search.recent.{dataset}': {
    version: number
    recentSearches: unknown[]
    [extra: string]: unknown
  }
  'studio.announcement.seen': string[]
  'studio.timezone.scheduled-publishing': string
  'studio.timezone.content-releases': string
  'studio.timezone.input.{inputId}': string
}

type Name = keyof Values
type ListName = {[N in Name]: Values[N] extends PreferenceListItem[] ? N : never}[Name]
// `studio.structure-tool.layout.{paneKey}` becomes `studio.structure-tool.layout.${string}`
type KeyOf<N extends Name> = N extends `${infer Prefix}{${string}}` ? `${Prefix}${string}` : N
type NameOf<K extends string> = {[N in Name]: K extends KeyOf<N> ? N : never}[Name]

/**
 * Every preference key the SDK knows, like `studio.structure-tool.layout.${string}`.
 * @internal
 */
export type PreferenceKey = {[N in Name]: KeyOf<N>}[Name]

/**
 * The value a preference key holds.
 * @internal
 */
export type PreferenceValue<K extends PreferenceKey> = Values[NameOf<K>]

/**
 * A key with a value it can hold, like `{key: 'studio.structure-tool.inspect-view-mode', value: 'raw'}`.
 * @internal
 */
export type PreferenceKeyValue = {[N in Name]: {key: KeyOf<N>; value: Values[N]}}[Name]

/**
 * A key's next value: the value itself, `undefined` to remove the user's own value, or a function
 * of the value on screen, like a toggle.
 * @internal
 */
export type PreferenceEdit<K extends PreferenceKey> =
  | PreferenceValue<K>
  | undefined
  | ((current: PreferenceValue<K>) => PreferenceValue<K> | undefined)

/**
 * Where the API says a value comes from: the user's own value everywhere (`user`), in a project
 * (`user@project`) or in an organization (`user@organization`), or `default` when they haven't set
 * one. The SDK turns it into a preference's `isDefault` and `resourceType`.
 * @internal
 */
export type PreferenceLevel = 'user' | 'user@project' | 'user@organization' | 'default'

/**
 * The kind of resource a preference is stored in: a project or an organization. Each user has
 * their own value in each one.
 * @internal
 */
export type PreferenceResourceType = Extract<AccessResourceType, 'organization' | 'project'>

// Where a key keeps each user's value: per project or organization, or `user` for one value per
// user everywhere
type StoredIn = PreferenceResourceType | 'user'

// `satisfies` checks each default against its key's value type, and that exactly the keys whose
// value is a list of items are marked `list`. `studio.announcement.seen` is a list of strings, not
// of items, so it isn't one
const KEYS = {
  'manage.favorites.projects': {resourceType: 'user', defaultValue: [], list: true},
  'studio.structure-tool.layout.{paneKey}': {resourceType: 'project', defaultValue: 'default'},
  'studio.structure-tool.sort-order.{paneKey}': {resourceType: 'project', defaultValue: {by: []}},
  'studio.structure-tool.inspect-view-mode': {resourceType: 'project', defaultValue: 'parsed'},
  'studio.search.recent.{dataset}': {
    resourceType: 'project',
    defaultValue: {version: 3, recentSearches: []},
  },
  'studio.announcement.seen': {resourceType: 'project', defaultValue: []},
  'studio.timezone.scheduled-publishing': {resourceType: 'project', defaultValue: 'UTC'},
  'studio.timezone.content-releases': {resourceType: 'project', defaultValue: 'UTC'},
  'studio.timezone.input.{inputId}': {resourceType: 'project', defaultValue: 'UTC'},
} satisfies {
  [N in Name]: {resourceType: StoredIn; defaultValue: Values[N]} & (N extends ListName
    ? {list: true}
    : {list?: never})
}

/**
 * The kind of resource a key is stored in, like `project` for a pane's layout, or `never` for a key
 * stored on the user alone.
 * @internal
 */
export type PreferenceResourceTypeOf<K extends PreferenceKey> = Exclude<
  (typeof KEYS)[NameOf<K>]['resourceType'],
  'user'
>

/**
 * Where a key keeps each user's value, the value a user has before they set one, and whether it's
 * a list of items.
 * @internal
 */
export function lookUpKey(key: string): {
  resourceType: StoredIn
  defaultValue: unknown
  list?: boolean
} {
  for (const [name, info] of Object.entries(KEYS)) {
    // The API only puts a `{part}` at the end of a name
    const [prefix, part] = name.split('{')
    const matches = part ? key.length > prefix!.length && key.startsWith(prefix!) : key === name
    if (matches) return info
  }
  throw new PreferenceError(
    'keyNotDeclared',
    `Unknown preference key "${key}". Check the key for typos, or update @sanity/sdk to a version that declares it.`,
  )
}

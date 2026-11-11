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

// The item type of every key the preferences API keeps as separate items. These hold more than fits
// in one value, so they're read a page at a time and changed one item at a time
interface ItemValues {
  'studio.vision-tool.saved-queries': {
    _key: string
    url: string
    savedAt: string
    title?: string
    [extra: string]: unknown
  }
}

/**
 * A key for a long personal list kept as separate items, like `studio.vision-tool.saved-queries`,
 * read a page at a time.
 * @internal
 */
export type PreferenceListKey = keyof ItemValues

/**
 * The value of one item under a {@link PreferenceListKey}.
 * @internal
 */
export type PreferenceListItemValue<K extends PreferenceListKey> = ItemValues[K]

/**
 * An items key with a value one of its items can hold.
 * @internal
 */
export type PreferenceListItemKeyValue = {
  [K in PreferenceListKey]: {key: K; value: PreferenceListItemValue<K>}
}[PreferenceListKey]

/**
 * Where the API says a value comes from: the user's own value everywhere (`user`), in a project
 * (`user@project`) or in an organization (`user@organization`); the value everyone in a project
 * (`project`) or organization (`organization`) shares; or `default` when nobody has set one. The
 * SDK turns it into a preference's `isDefault`, `shared` and `resourceType`.
 * @internal
 */
export type PreferenceLevel =
  | 'user'
  | 'user@project'
  | 'user@organization'
  | 'project'
  | 'organization'
  | 'default'

/**
 * The kind of resource a preference is stored in: a project or an organization. Each user can have
 * their own value in each one, and everyone in it can share one.
 * @internal
 */
export type PreferenceResourceType = Extract<AccessResourceType, 'organization' | 'project'>

/**
 * A level a key can store a value at.
 * @internal
 */
export type StoredLevel = Exclude<PreferenceLevel, 'default'>

// The levels the API stores each key at, most specific first. `satisfies` checks each default
// against its key's value type, and that exactly the keys whose value is a list of items are
// marked `list`. `studio.announcement.seen` is a list of strings, not of items, so it isn't one
const KEYS = {
  'manage.favorites.projects': {levels: ['user'], defaultValue: [], list: true},
  'studio.structure-tool.layout.{paneKey}': {levels: ['user@project'], defaultValue: 'default'},
  'studio.structure-tool.sort-order.{paneKey}': {levels: ['user@project'], defaultValue: {by: []}},
  'studio.structure-tool.inspect-view-mode': {levels: ['user@project'], defaultValue: 'parsed'},
  'studio.search.recent.{dataset}': {
    levels: ['user@project'],
    defaultValue: {version: 3, recentSearches: []},
  },
  'studio.announcement.seen': {levels: ['user@project'], defaultValue: []},
  'studio.timezone.scheduled-publishing': {levels: ['user@project'], defaultValue: 'UTC'},
  'studio.timezone.content-releases': {levels: ['user@project'], defaultValue: 'UTC'},
  'studio.timezone.input.{inputId}': {levels: ['user@project'], defaultValue: 'UTC'},
} satisfies {
  [N in Name]: {levels: StoredLevel[]; defaultValue: Values[N]} & (N extends ListName
    ? {list: true}
    : {list?: never})
}

// These keys have no single value, so no default
const ITEMS_KEYS = {
  'studio.vision-tool.saved-queries': {levels: ['user@project'], defaultValue: null},
} satisfies {[K in PreferenceListKey]: {levels: StoredLevel[]; defaultValue: null}}

/**
 * The levels a key is stored at, like `user@project` for a pane's layout.
 * @internal
 */
export type PreferenceLevelsOf<K extends PreferenceKey | PreferenceListKey> =
  K extends PreferenceListKey
    ? (typeof ITEMS_KEYS)[K]['levels'][number]
    : (typeof KEYS)[NameOf<K>]['levels'][number]

/**
 * The levels a key is stored at, most specific first, its value before anyone sets one, and
 * whether it's a list of items.
 * @internal
 */
export function lookUpKey(key: string): {
  levels: readonly StoredLevel[]
  defaultValue: unknown
  list?: boolean
} {
  for (const [name, info] of Object.entries({...KEYS, ...ITEMS_KEYS})) {
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

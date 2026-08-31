import {
  type Application,
  type ApplicationInclude,
  type CurrentUser,
  type OrganizationBase,
} from '@sanity/sdk'

type RemoteModule = {
  readonly entry: string
  readonly moduleId: string
  readonly version: string
}

/**
 * Declares a state topic: holds a current value, replayed to new subscribers.
 * @public
 */
export type StateTopicDef<T> = {kind: 'state'; value: T}

/**
 * Declares an event topic: a stream of occurrences with no memory. Declaring a
 * `reply` makes it a request topic — an awaited `emit` resolves with that reply.
 * @public
 */
export type EventTopicDef<P, R = never> = {
  kind: 'event'
  payload: P
  reply?: R
}

/**
 * The value of a state topic that can fail independently of the session. One
 * `ok` discriminant across all such topics, so consumers can share failure
 * handling (e.g. a retry utility) without per-topic shapes.
 * @public
 */
export type TopicResult<T> = {ok: true; value: T} | {ok: false}

/**
 * A place in the workbench: an application plus a route inside it, never a shell
 * URL — the shape has to survive a router swap. `appId` is `null` on
 * workbench-level pages (home, account) and on any path no application claims,
 * an unresolved app route included. `path` carries the query string and
 * fragment; app-internal it has no leading slash, a workbench-level one keeps it.
 * @public
 */
export type NavigationTarget = {
  appId: Application['id'] | null
  path: string
}

/**
 * Where the workbench is, plus the navigation in flight. Mirrors the Navigation
 * API's `navigation.transition`, minus its `from` — that is this value.
 * @public
 */
export type NavigationLocation = NavigationTarget & {
  transition: {
    navigationType: 'push' | 'replace'
    to: NavigationTarget
  } | null
}

/**
 * The topics the workbench itself owns. Every topic lands here with its owner's
 * publish wiring. A session-derived value must not outlive the session: such
 * topics clear (publish `null`) when the user signs out.
 * @public
 */
export interface WorkbenchTopics {
  'applications.foreground': StateTopicDef<Application['id'] | null>
  'applications.list': StateTopicDef<TopicResult<Application<ApplicationInclude>[]> | null>
  /**
   * The session token the requesting app reads; `null` while signed out. Each
   * connection carries its app id, so per-app tokens can land later without
   * changing the contract — today every app reads the same session token.
   * Read-only for apps: published by the auth machine, cleared to `null` on
   * sign-out. Suspends until auth settles.
   */
  'auth.token': StateTopicDef<string | null>
  /**
   * Requests the session token on demand, for an app that wants to re-fetch
   * rather than wait on its `auth.token` subscription (e.g. after a rejected
   * request). Carries the caller's app id. Today it resends the session's
   * current token — the seam where per-app re-issuance lands later. Fails
   * `NO_RESPONDER` while signed out.
   */
  'auth.token.refresh': EventTopicDef<void, string>
  /**
   * The media library's deployment configuration, as a {@link RemoteModule}
   * to its config federation module.
   */
  'media-libraries.config': StateTopicDef<RemoteModule | null>
  /**
   * Where the workbench is, and what navigation is in flight; `null` once the
   * session ends. Unlike `applications.foreground`, this publishes on in-app
   * navigation too. Suspends until the first publish; published by the
   * navigation machine.
   */
  'navigation.location': StateTopicDef<NavigationLocation | null>
  /**
   * Requests navigation, replying once it commits — the URL has changed and
   * `navigation.location` carries where the user landed. Requesting the
   * current location replies `ok` without navigating. Accepts relative and
   * same-origin absolute URLs; `history` defaults to `push`.
   *
   * `ok: false` reasons:
   * - `not-navigable` — off-origin, a URL that does not parse, a panel-only app, or a path a deployed core app's route cannot carry
   * - `interrupted` — superseded by a newer request, or the user navigated elsewhere, before it committed
   * - `failed` — the router refused the href, or never committed within 10s, which
   *   only a caller waiting longer than the default 5s `emit` timeout ever reads
   *
   * Fails `NO_RESPONDER` while signed out. Responded to by the navigation machine.
   */
  'navigation.location.update': EventTopicDef<
    {
      url: string
      history?: 'push' | 'replace'
    },
    {ok: true} | {ok: false; reason: 'not-navigable' | 'interrupted' | 'failed'}
  >
  /**
   * The session's organization context; `null` when signed out or the fetch
   * failed. Everything else is fetched against it. Suspends until the first
   * value arrives; published by the organization machine, which keeps it in
   * step with the organization store for as long as the session is open.
   */
  'organizations.current': StateTopicDef<Pick<OrganizationBase, 'id' | 'name' | 'slug'> | null>
  /**
   * The open panel — its owning app, the panel view's name, and its mode. Only
   * `aside` carries a width (px); `full` overlays the main area, so a width is
   * meaningless there. `value: null` when closed, `null` once the session ends.
   * Width is remembered per app + panel name across mode switches. The
   * applications machine and applications may publish changes.
   */
  'panels.mode': StateTopicDef<TopicResult<
    | {appId: string; name: string; mode: 'aside'; size?: number}
    | {appId: string; name: string; mode: 'full'}
    | null
  > | null>
  /**
   * A change an app requests for its own panel: set its mode (opens it, or
   * switches aside/full), resize it without resending the mode, or `null` to
   * close.
   */
  'panels.mode.set': EventTopicDef<
    {name: string; mode: 'aside' | 'full'} | {name: string; size: number} | null
  >
  /**
   * The resolved color scheme the workbench renders with — the user's
   * preference, falling back to the OS scheme. Environment-derived, not
   * session data: it stays published across sign-out (the login screen renders
   * with it too). The system-preferences machine publishes at boot;
   * applications may publish later changes.
   */
  'preferences.color-scheme': StateTopicDef<'light' | 'dark'>
  /**
   * Whether the dock sidebar is pinned open. Like `preferences.color-scheme`,
   * an environment-derived UI preference that stays published across sign-out.
   * The system-preferences machine publishes at boot; applications may publish
   * later changes.
   */
  'preferences.dock-locked': StateTopicDef<boolean>
  /**
   * The signed-in user, or `null` when signed out. Suspends until auth settles;
   * published by the auth machine.
   */
  'users.current': StateTopicDef<Pick<CurrentUser, 'id' | 'name' | 'email' | 'profileImage'> | null>
}

/**
 * The central topic registry — every call site is type-checked against it.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration merging extends the SDK manifest.
export interface Topics extends WorkbenchTopics {}

/**
 * Every declared topic name.
 * @public
 */
export type TopicName = keyof Topics

type StateTopicsOf<T> = {
  [K in keyof T]: T[K] extends {kind: 'state'} ? K : never
}[keyof T]

/**
 * Names of all declared state topics.
 * @public
 */
export type StateTopic = StateTopicsOf<Topics>

type TopicOwnership = {readonly type: 'same_app'} | {readonly type: 'any_app'}

type TopicManifestEntry<T> = T extends {kind: 'state'; value: infer V}
  ? {
      readonly kind: 'state'
      readonly ownership: TopicOwnership
      readonly seed: V | undefined
    }
  : {readonly kind: 'event'; readonly ownership: TopicOwnership}

const withOwnership =
  <const Ownership extends TopicOwnership>(ownership: Ownership) =>
  <const Topic extends {readonly kind: 'state'; readonly seed: unknown} | {readonly kind: 'event'}>(
    topic: Topic,
  ) => ({...topic, ownership})

// `same_app`: only the app that installed the bus can publish state or respond to events.
const workbenchTopic = withOwnership({type: 'same_app'})
// `any_app`: every connected app can publish state or respond to events.
const sharedTopic = withOwnership({type: 'any_app'})

/**
 * What the bus knows about each topic at runtime: its kind, ownership, and
 * initial value. Mirrors {@link WorkbenchTopics}, which is types-only.
 * Every copy merges this into the shared core on `connect`, so it doesn't
 * matter which copy loads first (SDK-1876). Topics added by augmenting
 * `Topics` use `defineStateTopics` instead.
 * @internal
 */
export const WORKBENCH_TOPIC_MANIFEST: {
  readonly [K in keyof WorkbenchTopics]: TopicManifestEntry<WorkbenchTopics[K]>
} = {
  'applications.foreground': workbenchTopic({kind: 'state', seed: null}),
  'applications.list': workbenchTopic({kind: 'state', seed: undefined}),
  'auth.token': workbenchTopic({kind: 'state', seed: undefined}),
  'auth.token.refresh': workbenchTopic({kind: 'event'}),
  'media-libraries.config': workbenchTopic({
    kind: 'state',
    seed: undefined,
  }),
  'navigation.location': workbenchTopic({kind: 'state', seed: undefined}),
  'navigation.location.update': workbenchTopic({kind: 'event'}),
  'organizations.current': workbenchTopic({kind: 'state', seed: undefined}),
  'panels.mode': sharedTopic({
    kind: 'state',
    seed: {ok: true, value: null},
  }),
  'panels.mode.set': workbenchTopic({kind: 'event'}),
  'preferences.color-scheme': sharedTopic({
    kind: 'state',
    seed: undefined,
  }),
  'preferences.dock-locked': sharedTopic({
    kind: 'state',
    seed: undefined,
  }),
  'users.current': workbenchTopic({kind: 'state', seed: undefined}),
}

/**
 * What `connect` merges into the shared core. Loose on purpose: another copy
 * may know topics this one doesn't.
 * @internal
 */
export type TopicManifest = Readonly<
  Record<
    string,
    | {
        readonly kind: 'state'
        readonly ownership: TopicOwnership
        readonly seed: unknown
      }
    | {readonly kind: 'event'; readonly ownership: TopicOwnership}
  >
>

/**
 * Names of all declared event topics.
 * @public
 */
export type EventTopic = {
  [K in TopicName]: Topics[K] extends {kind: 'event'} ? K : never
}[TopicName]

/**
 * The value type of a state topic.
 * @public
 */
export type ValueOf<K extends StateTopic> = Topics[K] extends StateTopicDef<infer T> ? T : never

/**
 * The payload type of an event topic.
 * @public
 */
export type PayloadOf<K extends EventTopic> =
  Topics[K] extends EventTopicDef<infer P, infer _R> ? P : never

/**
 * The reply type of an event topic (`never` if it declares none).
 * @public
 */
export type ReplyOf<K extends EventTopic> =
  Topics[K] extends EventTopicDef<infer _P, infer R> ? R : never

/**
 * One adjacent version step: `up` lifts the older shape, `down` projects back.
 * Request replies are not migrated — evolve them additively.
 * @internal
 */
export interface TopicMigration {
  /** The older version this step lifts from / projects back to. */
  readonly from: number
  /** The newer version (`from + 1`). */
  readonly to: number
  up(older: unknown): unknown
  down(newer: unknown): unknown
}

/**
 * Per-topic migration chains; a topic's version is its chain depth. On a shape
 * change, keep `Topics` at the newest shape and append the adjacent step here.
 * @internal
 */
export const topicMigrations: Partial<Record<TopicName, readonly TopicMigration[]>> = {}

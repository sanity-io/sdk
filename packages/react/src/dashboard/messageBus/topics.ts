import {
  type Application,
  type ApplicationBase,
  type ApplicationInterface,
  type CurrentUser,
  type OrganizationBase,
} from '@sanity/sdk'

type DashboardInterfaceBase = Omit<ApplicationInterface, 'metadata' | 'type'>
type DashboardDockGroup = 'dock.system' | 'dock.applications' | 'dock.user'
type DashboardApplicationInterface = DashboardInterfaceBase &
  (
    | {type: 'app'; metadata: {dock: {group?: DashboardDockGroup; order?: number}} | null}
    | {type: 'panel'; metadata: {dock: {group?: DashboardDockGroup; order?: number}} | null}
    | {type: 'asset_source'; metadata: null}
    | {type: 'worker'; metadata: null}
    | {type: 'tile'; metadata: {order?: number; size: 'small' | 'large' | 'banner'}}
  )
type DashboardApplication = ApplicationBase & {
  activeDeployment?: {interfaces?: DashboardApplicationInterface[]} | null
  config?: {mfManifest?: unknown}
}

/**
 * Identifies a module federation expose and the manifest that serves it.
 * @public
 */
export interface RemoteModuleRef {
  readonly entry: string
  readonly moduleId: string
  readonly version: string
}

/**
 * Application types that can receive configuration modules.
 * @public
 */
export type ApplicationConfigAppType = 'media-library'

/**
 * Identifies a configuration module for an application or application type.
 * @public
 */
export interface ApplicationConfig extends RemoteModuleRef {
  readonly appId?: Application['id']
  readonly appType: ApplicationConfigAppType
}

/**
 * Declares a topic that stores and replays its current value.
 * @public
 */
export type StateTopicDef<T> = {kind: 'state'; value: T}

/**
 * Declares a topic that delivers events and an optional reply.
 * @public
 */
export type EventTopicDef<P, R = never> = {
  kind: 'event'
  payload: P
  reply?: R
}

/**
 * Represents a successful topic value or a failed topic operation.
 * @public
 */
export type TopicResult<T> = {ok: true; value: T} | {ok: false}

/**
 * Identifies a dashboard application and a route within it.
 * @public
 */
export type NavigationTarget = {
  /** The application ID, or `null` for dashboard-level routes. */
  appId: Application['id'] | null
  /** The route path, including its query string and fragment. */
  path: string
}

/**
 * Describes the current dashboard location and an active navigation.
 * @public
 */
export type NavigationLocation = NavigationTarget & {
  /** The active navigation, or `null` when navigation is idle. */
  transition: {
    /** Whether the navigation pushes or replaces browser history. */
    navigationType: 'push' | 'replace'
    /** The requested destination. */
    to: NavigationTarget
  } | null
}

/**
 * Declares the topics provided by the dashboard.
 * @public
 */
export interface DashboardTopics {
  /** The available application configuration modules. */
  'applications.config': StateTopicDef<ApplicationConfig[] | null>
  /** The foreground application ID, or `null` on dashboard-level routes. */
  'applications.foreground': StateTopicDef<Application['id'] | null>
  /** The dashboard applications available to the current user. */
  'applications.list': StateTopicDef<TopicResult<DashboardApplication[]> | null>
  /** The dashboard session token, or `null` while signed out. */
  'auth.token': StateTopicDef<string | null>
  /** Requests a dashboard session token. */
  'auth.token.refresh': EventTopicDef<void, string>
  /** The current dashboard location and active navigation. */
  'navigation.location': StateTopicDef<NavigationLocation | null>
  /**
   * Requests navigation and replies when the location commits.
   *
   * `ok: false` reasons:
   * - `not-navigable`: the URL cannot be handled by a dashboard application
   * - `interrupted`: another navigation superseded the request
   * - `failed`: the router rejected or did not commit the request
   */
  'navigation.location.update': EventTopicDef<
    {
      url: string
      history?: 'push' | 'replace'
    },
    {ok: true} | {ok: false; reason: 'not-navigable' | 'interrupted' | 'failed'}
  >
  /** The current organization, or `null` without an active organization. */
  'organizations.current': StateTopicDef<Pick<OrganizationBase, 'id' | 'name' | 'slug'> | null>
  /** The open panel, its application, display mode, and optional width in pixels. */
  'panels.mode': StateTopicDef<TopicResult<
    | {appId: string; name: string; mode: 'aside'; size?: number}
    | {appId: string; name: string; mode: 'full'}
    | null
  > | null>
  /** Opens, updates, resizes, or closes an application's panel. */
  'panels.mode.set': EventTopicDef<
    {name: string; mode: 'aside' | 'full'} | {name: string; size: number} | null
  >
  /** The resolved dashboard color scheme. */
  'preferences.color-scheme': StateTopicDef<'light' | 'dark'>
  /** Whether the dashboard dock is pinned open. */
  'preferences.dock-locked': StateTopicDef<boolean>
  /** The signed-in user, or `null` while signed out. */
  'users.current': StateTopicDef<Pick<CurrentUser, 'id' | 'name' | 'email' | 'profileImage'> | null>
}

/**
 * Declares every topic available through the message bus.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration merging extends the SDK manifest.
export interface Topics extends DashboardTopics {}

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

// `same_app` restricts publishing and responding to the application that installed the bus.
const dashboardTopic = withOwnership({type: 'same_app'})
// `any_app` allows every connected application to publish and respond.
const sharedTopic = withOwnership({type: 'any_app'})

/**
 * Defines the runtime kind, ownership, and initial value of dashboard topics.
 * @internal
 */
export const DASHBOARD_TOPIC_MANIFEST: {
  readonly [K in keyof DashboardTopics]: TopicManifestEntry<DashboardTopics[K]>
} = {
  'applications.config': dashboardTopic({kind: 'state', seed: undefined}),
  'applications.foreground': dashboardTopic({kind: 'state', seed: null}),
  'applications.list': dashboardTopic({kind: 'state', seed: undefined}),
  'auth.token': dashboardTopic({kind: 'state', seed: undefined}),
  'auth.token.refresh': dashboardTopic({kind: 'event'}),
  'navigation.location': dashboardTopic({kind: 'state', seed: undefined}),
  'navigation.location.update': dashboardTopic({kind: 'event'}),
  'organizations.current': dashboardTopic({kind: 'state', seed: undefined}),
  'panels.mode': sharedTopic({
    kind: 'state',
    seed: {ok: true, value: null},
  }),
  'panels.mode.set': dashboardTopic({kind: 'event'}),
  'preferences.color-scheme': sharedTopic({
    kind: 'state',
    seed: undefined,
  }),
  'preferences.dock-locked': sharedTopic({
    kind: 'state',
    seed: undefined,
  }),
  'users.current': dashboardTopic({kind: 'state', seed: undefined}),
}

/**
 * Defines the runtime manifest accepted from any message bus version.
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
 * Converts a topic value between 2 adjacent versions.
 * @internal
 */
export interface TopicMigration {
  /** The older version. */
  readonly from: number
  /** The newer version. */
  readonly to: number
  /** Converts an older state value or event payload to the newer version. */
  up(older: unknown): unknown
  /** Converts a newer state value or event payload to the older version. */
  down(newer: unknown): unknown
  /** Converts event replies between these versions. */
  readonly reply?: {
    /** Converts an older reply to the newer version. */
    up(older: unknown): unknown
    /** Converts a newer reply to the older version. */
    down(newer: unknown): unknown
  }
}

/**
 * Defines the bundled migration chain for each topic.
 * @internal
 */
export const topicMigrations: Partial<Record<TopicName, readonly TopicMigration[]>> = {}

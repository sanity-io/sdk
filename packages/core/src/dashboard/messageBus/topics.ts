import {type CurrentUser} from '@sanity/types'

import {type Application, type ApplicationInclude} from '../../applications/applications'
import {type OrganizationBase} from '../../organization/organization'

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
 *
 * The dashboard supplies this value over the message bus, so any string is accepted; known
 * types are listed for autocomplete. `& {}` keeps the literal from collapsing into `string`.
 * @public
 */
export type ApplicationConfigAppType = 'media-library' | (string & {})

/**
 * Identifies a configuration module for an application or application type.
 * @public
 */
export interface ApplicationConfig extends RemoteModuleRef {
  readonly appId?: Application['id']
  readonly appType: ApplicationConfigAppType
}

/**
 * A label rendered for an application interface; `null` clears it.
 * @internal
 */
export type ApplicationStatus = {label: string | null}

/**
 * Updates the status rendered for an application interface.
 * @internal
 */
export type ApplicationStatusUpdate = {
  /** The application interface name. */
  name: string
  /** The status to render. */
  value: ApplicationStatus
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
  /**
   * The base path for an application.
   *
   * An unknown application returns `{ok: false}`.
   */
  'applications.base-path': StateTopicDef<TopicResult<string>>
  /** The available application configuration modules. */
  'applications.config': StateTopicDef<ApplicationConfig[] | null>
  /** The foreground application ID, or `null` on dashboard-level routes. */
  'applications.foreground': StateTopicDef<Application['id'] | null>
  /** The dashboard applications available to the current user. */
  'applications.list': StateTopicDef<TopicResult<Application<ApplicationInclude>[]> | null>
  /**
   * The session token for the reading connection, or `null` while signed out. The host
   * writes it to each connection separately, so one application never sees another's token.
   */
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
  'users.current': StateTopicDef<CurrentUser | null>
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

// State is only ever written by the host, one connection at a time, so it carries no ownership.
type TopicManifestEntry<T> = T extends {kind: 'state'; value: infer V}
  ? {readonly kind: 'state'; readonly seed: V | undefined}
  : {readonly kind: 'event'; readonly ownership: TopicOwnership}

// The value a connection's copy of the topic starts with; `undefined` means unpublished.
const stateTopic = <const V>(seed: V) => ({kind: 'state', seed}) as const

// `same_app` restricts responding to the application that installed the bus.
const dashboardEvent = {kind: 'event', ownership: {type: 'same_app'}} as const

/**
 * Dashboard topics reserved for internal application code.
 * @internal
 */
export interface InternalDashboardTopics {
  'applications.status.update': EventTopicDef<ApplicationStatusUpdate>
}

type BundledDashboardTopics = DashboardTopics & InternalDashboardTopics

type DashboardTopicManifest = {
  readonly [K in keyof BundledDashboardTopics]: TopicManifestEntry<BundledDashboardTopics[K]>
}

/**
 * Defines the runtime kind, ownership, and initial value of dashboard topics.
 * @internal
 */
export const DASHBOARD_TOPIC_MANIFEST: DashboardTopicManifest = {
  'applications.base-path': stateTopic(undefined),
  'applications.config': stateTopic(undefined),
  'applications.foreground': stateTopic(undefined),
  'applications.list': stateTopic(undefined),
  'applications.status.update': dashboardEvent,
  'auth.token': stateTopic(undefined),
  'auth.token.refresh': dashboardEvent,
  'navigation.location': stateTopic(undefined),
  'navigation.location.update': dashboardEvent,
  'organizations.current': stateTopic(undefined),
  'panels.mode': stateTopic({ok: true, value: null}),
  'panels.mode.set': dashboardEvent,
  'preferences.color-scheme': stateTopic(undefined),
  'preferences.dock-locked': stateTopic(undefined),
  'users.current': stateTopic(undefined),
}

/**
 * Defines the runtime manifest accepted from any message bus version.
 * @internal
 */
export type TopicManifest = Readonly<
  Record<
    string,
    | {readonly kind: 'state'; readonly seed: unknown}
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
export const topicMigrations: Partial<
  Record<TopicName | keyof InternalDashboardTopics, readonly TopicMigration[]>
> = {}

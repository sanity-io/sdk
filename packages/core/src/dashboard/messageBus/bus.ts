/* eslint-disable no-console -- The bus can initialize before the SDK logger exists. */
import {
  BehaviorSubject,
  concat,
  defer,
  filter,
  firstValueFrom,
  from,
  map,
  type Observable,
  ReplaySubject,
  Subject,
  type Subscription,
  takeUntil,
} from 'rxjs'

import {type Application} from '../../applications/applications'
import {
  DASHBOARD_TOPIC_MANIFEST,
  type EventTopic,
  type MessageBusTopics,
  type PayloadOf,
  type ReplyOf,
  type StateTopic,
  type TopicManifest,
  type TopicMigration,
  topicMigrations,
  type TopicName,
  type Topics,
  type ValueOf,
} from './topics'

/**
 * A message bus protocol error code.
 * @public
 */
export type MessageBusErrorCode =
  | 'NO_RESPONDER'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HANDLER_THREW'
  | 'PROTOCOL_MISMATCH'
  | 'OWNERSHIP_MISMATCH'
  | 'MISSING_APP_ID'
  | 'REFUSED'

/**
 * An error raised by the message bus protocol.
 * @public
 */
export class MessageBusError extends Error {
  /** The machine-readable protocol error code. */
  readonly code: MessageBusErrorCode

  /** Creates a message bus protocol error. */
  constructor(code: MessageBusErrorCode, message?: string, options?: {cause?: unknown}) {
    super(message ?? code, options)
    this.name = 'MessageBusError'
    this.code = code
  }
}

/**
 * Metadata that travels with each message bus event.
 * @public
 */
export interface MessageBusMeta {
  /** The application that produced the message. */
  appId: Application['id']
  /**
   * The federation module id of the connection that sent the message (e.g.
   * `favorites/views/list/panel`). Absent from older copies and when the host
   * supplied none, so readers normalise with `message.meta.moduleId ?? message.meta.appId`.
   */
  moduleId?: string
  /** The Unix timestamp in milliseconds when the message was produced. */
  timestamp: number
}

/**
 * A message delivered to an event topic responder.
 * @public
 */
export interface MessageBusMessage<T, R = never, K extends PropertyKey = TopicName> {
  /** The topic that carries the message. */
  type: K
  /** The event payload. */
  payload: T
  /** The message provenance. */
  meta: MessageBusMeta
  /** Replies to an awaiting sender. */
  reply(value: R): void
  /**
   * Refuses the message: the sender's awaited `emit()` rejects with a
   * {@link MessageBusError} whose `code` is `'REFUSED'`. Ignored, with a warning,
   * once the reply has already settled.
   */
  reject(message?: string): void
  /** Aborts when the sender stops waiting for a reply. */
  readonly signal: AbortSignal
}

/**
 * An observable state topic with access to its current and first values.
 * @public
 */
export interface MessageBusStateSource<T> extends Observable<T> {
  /** Returns the current value, or `undefined` before the first value is published. */
  getCurrent(): T | undefined
  /** Resolves with the first published value. */
  readonly firstValue: Promise<T>
}

/**
 * Options for aborting a message bus operation.
 * @public
 */
export interface MessageBusAbortOptions {
  /** Aborts the operation when signaled. */
  signal?: AbortSignal
}

/**
 * Options for reading a state topic.
 * @public
 */
export interface MessageBusQueryOptions extends MessageBusAbortOptions {
  /** Wait timeout in milliseconds. Defaults to 5 seconds; `null` disables it. */
  timeout?: number | null
}

/**
 * Options for emitting an event topic.
 * @public
 */
export interface MessageBusEmitOptions extends MessageBusAbortOptions {
  /** Reply timeout in milliseconds. Defaults to 5 seconds; `null` disables it. */
  timeout?: number | null
}

/**
 * A lazily awaited event reply.
 * @public
 */
export interface MessageBusEmitResult<R> extends PromiseLike<R> {
  /** Handles a rejected event reply. */
  catch<T = never>(onRejected?: (reason: unknown) => T | PromiseLike<T>): Promise<R | T>
  /** Runs after the event reply settles. */
  finally(onFinally?: () => void): Promise<R>
}

/**
 * Sends events and reads typed state and event topics.
 *
 * @remarks
 * State topics are written by the host to each connection separately through
 * {@link MessageBusClient.emit}; a connection only ever reads its own values.
 * @public
 */
export interface MessageBus<TTopics = MessageBusTopics> {
  /** Emits an event topic and provides its reply when awaited. */
  emit<K extends EventTopic<TTopics>>(
    type: K,
    ...rest: PayloadOf<K, TTopics> extends void
      ? [payload?: void, options?: MessageBusEmitOptions]
      : [payload: PayloadOf<K, TTopics>, options?: MessageBusEmitOptions]
  ): MessageBusEmitResult<ReplyOf<K, TTopics>>
  /** Reads the current or next value of a state topic. */
  query<K extends StateTopic<TTopics>>(
    type: K,
    options?: MessageBusQueryOptions,
  ): Promise<ValueOf<K, TTopics>>
  /** Runs a responder for each event until its signal aborts. */
  subscribe<K extends EventTopic<TTopics>>(
    type: K,
    handler: (message: MessageBusMessage<PayloadOf<K, TTopics>, ReplyOf<K, TTopics>, K>) => void,
    options?: MessageBusAbortOptions,
  ): void
  /** Runs a handler for each state value until its signal aborts. */
  subscribe<K extends StateTopic<TTopics>>(
    type: K,
    handler: (value: ValueOf<K, TTopics>) => void,
    options?: MessageBusAbortOptions,
  ): void
  /** Returns a state topic as a `MessageBusStateSource`. */
  subscribe<K extends StateTopic<TTopics>>(type: K): MessageBusStateSource<ValueOf<K, TTopics>>
  /** Returns an event topic as an observable of its payloads. */
  subscribe<K extends EventTopic<TTopics>>(type: K): Observable<PayloadOf<K, TTopics>>
}

/**
 * A message bus connection that can be torn down independently of its siblings.
 * @public
 */
export interface MessageBusConnection<TTopics = MessageBusTopics> extends MessageBus<TTopics> {
  /** The application this connection belongs to. */
  readonly appId: Application['id']
  /**
   * Tears down this connection: pending requests reject `ABORTED`, subscriptions
   * complete, and later `emit`, `query`, and `subscribe` calls fail with `ABORTED`.
   * Siblings and the shared bus are untouched.
   */
  disconnect(): void
}

/**
 * The host's handle to one connection: who it is, when it closes, and where to write its state.
 * @public
 */
export interface MessageBusClient {
  /** The application the connection belongs to. */
  readonly appId: Application['id']
  /** The federation module id of the connection. Equals `appId` when the host supplied none. */
  readonly moduleId: string
  /** Aborts when the connection disconnects. Drop per-client state here. */
  readonly closed: AbortSignal
  /** Writes a state value to this connection only. Ignored once the connection has closed. */
  emit<K extends StateTopic>(type: K, value: ValueOf<K>): void
  /**
   * Rejects a state topic for this connection: its pending and later {@link MessageBus.query}
   * calls reject with a {@link MessageBusError} whose `code` is `'REFUSED'`, until the host next
   * writes a value with {@link MessageBusClient.emit}, which clears the rejection.
   *
   * @remarks
   * A rejected promise cannot be un-rejected and an errored subject cannot resume, so the
   * rejection is tracked per connection alongside the topic's subject rather than by erroring
   * it: `query` consults it before awaiting, and {@link MessageBus.subscribe} and the topic's
   * {@link MessageBusStateSource} stay silent (they never error) until a value is written.
   * Ignored once the connection has closed, the same as {@link MessageBusClient.emit}.
   */
  reject<K extends StateTopic>(type: K, message?: string): void
}

/**
 * The host's connection to the bus.
 *
 * @remarks
 * State reaches an application only through {@link MessageBusClient.emit}. There is no
 * broadcast: sending the same value to everyone is a loop over `connections`, and giving a
 * new connection the current values is done when it appears there, as an SSE server writes
 * a snapshot to each new client.
 * @public
 */
export interface MessageBusHost<TTopics = MessageBusTopics> extends MessageBusConnection<TTopics> {
  /**
   * Every open connection other than this one first, then each new one as it joins. The same
   * {@link MessageBusClient} object is handed out for a connection across subscriptions, so it
   * can be kept in a `Set`. A connection stays listed until it calls `disconnect()`; the SDK
   * does that when the owning `SanityInstance` is disposed.
   */
  readonly connections: Observable<MessageBusClient>
}

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
const MESSAGE_BUS_PROTOCOL_KEY = Symbol.for('sanity.os.protocol')
const MESSAGE_BUS_REGISTRY_KEY = Symbol.for('sanity.os.registry')
const MESSAGE_BUS_PENDING_REPLY_KEY = Symbol.for('sanity.os.request')

const MESSAGE_BUS_PROTOCOL = 1

const DEFAULT_TIMEOUT_MS = 5000

// Distinguishes an unpublished topic from a published `undefined` value.
const NO_VALUE = Symbol.for('sanity.os.no-value')

type ReplyOutcome =
  | {readonly ok: true; readonly value: unknown}
  | {readonly ok: false; readonly error: unknown}

// Defers Promise creation until the reply is awaited to preserve fire-and-forget emission.
interface PendingReply {
  readonly responderAbort: AbortController
  readonly responderSignal: AbortSignal
  settled: boolean
  outcomeBeforeAwait?: ReplyOutcome
  settlePromise?: (outcome: ReplyOutcome) => void
  replyPromise?: Promise<unknown>
}

// One connection: its identity, its own copy of every state topic, and its lifetime.
interface ConnectionRecord {
  readonly appId: string
  readonly moduleId: string
  readonly stateSubjects: Map<string, BehaviorSubject<unknown>>
  // Topics the host has rejected for this connection, with the reason, until the next write.
  readonly rejections: Map<string, string | undefined>
  // Fires the rejected topic name so pending queries on that topic can reject at once.
  readonly rejected$: Subject<string>
  readonly abort: AbortController
}

interface MessageBusRegistry {
  readonly appId: string
  readonly topics: Map<string, TopicManifest[string]>
  readonly connections: Set<ConnectionRecord>
  readonly connected$: Subject<ConnectionRecord>
  readonly eventSubjects: Map<string, Subject<MessageBusMessage<unknown, unknown>>>
  readonly responderCounts: Map<string, number>
  readonly migrations: ReadonlyMap<string, readonly TopicMigration[]>
  resetAbort: AbortController
  generation: number
}

type InternalMessageBus = MessageBus & {
  [MESSAGE_BUS_REGISTRY_KEY]: MessageBusRegistry
  [MESSAGE_BUS_PROTOCOL_KEY]: number
}

// A connection's box for a state topic, created on first use from the topic's manifest seed.
function resolveStateSubject(
  registry: MessageBusRegistry,
  connection: ConnectionRecord,
  type: string,
): BehaviorSubject<unknown> {
  // Callers gate on the connection's lifetime; this keeps a slipped call from recreating a
  // box on a closed connection that nothing would ever complete.
  if (connection.abort.signal.aborted) throw new MessageBusError('ABORTED')
  let subject = connection.stateSubjects.get(type)
  if (!subject) {
    const topic = registry.topics.get(type)
    if (!topic) {
      console.warn(`[sanity-sdk:message-bus] state topic "${type}" is not declared`)
    }
    const seed = topic?.kind === 'state' ? topic.seed : undefined
    subject = new BehaviorSubject<unknown>(seed === undefined ? NO_VALUE : seed)
    connection.stateSubjects.set(type, subject)
  }
  return subject
}

function toStateSource(
  values: Observable<unknown>,
  getCurrent: () => unknown,
): MessageBusStateSource<unknown> {
  const source = values as MessageBusStateSource<unknown>
  source.getCurrent = getCurrent
  // Unread sources must not create promises that reject when reset completes them.
  let firstValue: Promise<unknown> | undefined
  Object.defineProperty(source, 'firstValue', {
    get: () => (firstValue ??= firstValueFrom(values)),
  })
  return source
}

function assertCompatibleTopicManifest(
  registry: MessageBusRegistry,
  manifest: TopicManifest,
): void {
  for (const [type, entry] of Object.entries(manifest)) {
    const existing = registry.topics.get(type)
    if (existing && existing.kind !== entry.kind) {
      throw new MessageBusError(
        'PROTOCOL_MISMATCH',
        `topic "${type}" is declared "${entry.kind}" but the installed bus knows it as "${existing.kind}"`,
      )
    }
    if (
      existing?.kind === 'event' &&
      entry.kind === 'event' &&
      existing.ownership.type !== entry.ownership.type
    ) {
      throw new MessageBusError('OWNERSHIP_MISMATCH', `topic "${type}" has conflicting ownership`)
    }
  }
}

function mergeTopicManifest(registry: MessageBusRegistry, manifest: TopicManifest): void {
  assertCompatibleTopicManifest(registry, manifest)
  for (const [type, entry] of Object.entries(manifest)) registry.topics.set(type, entry)
}

function resolveEventSubject(
  registry: MessageBusRegistry,
  type: string,
): Subject<MessageBusMessage<unknown, unknown>> {
  let subject = registry.eventSubjects.get(type)
  if (!subject) {
    subject = new Subject<MessageBusMessage<unknown, unknown>>()
    registry.eventSubjects.set(type, subject)
  }
  return subject
}

function settleReply(reply: PendingReply, outcome: ReplyOutcome): void {
  if (reply.settled) return
  reply.settled = true
  if (reply.settlePromise) reply.settlePromise(outcome)
  else reply.outcomeBeforeAwait = outcome
}

function createEventMessage(
  appId: string,
  moduleId: string,
  type: string,
  payload: unknown,
  pendingReply: PendingReply,
): MessageBusMessage<unknown, unknown> {
  const message: MessageBusMessage<unknown, unknown> & {
    [MESSAGE_BUS_PENDING_REPLY_KEY]?: PendingReply
  } = {
    type: type as TopicName,
    payload,
    meta: {appId, moduleId, timestamp: Date.now()},
    reply: (value) => {
      if (pendingReply.settled) {
        console.warn(
          `[sanity-sdk:message-bus] reply ignored for "${type}": no waiting caller or already replied`,
        )
        return
      }
      settleReply(pendingReply, {ok: true, value})
    },
    reject: (reason) => {
      if (pendingReply.settled) {
        console.warn(
          `[sanity-sdk:message-bus] reject ignored for "${type}": no waiting caller or already replied`,
        )
        return
      }
      settleReply(pendingReply, {ok: false, error: new MessageBusError('REFUSED', reason)})
    },
    get signal() {
      return pendingReply.responderSignal
    },
  }

  message[MESSAGE_BUS_PENDING_REPLY_KEY] = pendingReply
  return message
}

function createReplyPromise(
  pendingReply: PendingReply,
  options: MessageBusEmitOptions & {hadResponderAtEmission: boolean},
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const settlePromise = (outcome: ReplyOutcome) =>
      outcome.ok ? resolve(outcome.value) : reject(outcome.error)

    if (pendingReply.outcomeBeforeAwait) {
      pendingReply.responderAbort.abort()
      settlePromise(pendingReply.outcomeBeforeAwait)
      return
    }
    if (!options.hadResponderAtEmission) {
      reject(new MessageBusError('NO_RESPONDER'))
      return
    }

    const timeoutMs = options.timeout === undefined ? DEFAULT_TIMEOUT_MS : options.timeout
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = () =>
      settleReply(pendingReply, {ok: false, error: new MessageBusError('ABORTED')})

    pendingReply.settlePromise = (outcome) => {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      pendingReply.responderAbort.abort()
      settlePromise(outcome)
    }

    if (timeoutMs !== null) {
      timer = setTimeout(
        () => settleReply(pendingReply, {ok: false, error: new MessageBusError('TIMEOUT')}),
        timeoutMs,
      )
    }
    if (options.signal) {
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, {once: true})
    }
  })
}

function createLazyReply<R>(awaitReply: () => Promise<R>): MessageBusEmitResult<R> {
  return {
    // oxlint-disable-next-line unicorn/no-thenable -- awaiting arms reply failure handling; fire-and-forget does not.
    then: (onFulfilled, onRejected) => awaitReply().then(onFulfilled, onRejected),
    catch: (onRejected) => awaitReply().then(undefined, onRejected),
    finally: (onFinally) => awaitReply().finally(onFinally),
  }
}

function emitEvent(
  registry: MessageBusRegistry,
  type: string,
  payload: unknown,
  options: MessageBusEmitOptions | undefined,
  appId: string,
  moduleId: string,
): MessageBusEmitResult<unknown> {
  const hadResponderAtEmission = (registry.responderCounts.get(type) ?? 0) > 0
  const responderAbort = new AbortController()
  const pendingReply: PendingReply = {
    responderAbort,
    responderSignal: scopeSignal(options?.signal, responderAbort.signal),
    settled: false,
  }

  resolveEventSubject(registry, type).next(
    createEventMessage(appId, moduleId, type, payload, pendingReply),
  )

  const awaitReply = () =>
    (pendingReply.replyPromise ??= createReplyPromise(pendingReply, {
      ...options,
      hadResponderAtEmission,
    }))
  return createLazyReply(awaitReply)
}

const isStateTopic = (registry: MessageBusRegistry, type: string): boolean =>
  registry.topics.get(type)?.kind === 'state'

const canRespond = (
  registry: MessageBusRegistry,
  ownership: {readonly type: 'same_app' | 'any_app'},
  appId: string,
): boolean => ownership.type === 'any_app' || appId === registry.appId

function emit(
  registry: MessageBusRegistry,
  type: string,
  payload: unknown,
  options: MessageBusEmitOptions | undefined,
  appId: string,
  moduleId: string,
  connectionSignal: AbortSignal,
): MessageBusEmitResult<unknown> {
  if (isStateTopic(registry, type)) {
    throw new MessageBusError(
      'OWNERSHIP_MISMATCH',
      `Cannot emit state topic "${type}" from app "${appId}". The host writes state to each connection through its client handle. Read it with query() or subscribe().`,
    )
  }
  return emitEvent(
    registry,
    type,
    payload,
    {
      ...options,
      signal: scopeSignal(options?.signal, registry.resetAbort.signal, connectionSignal),
    },
    appId,
    moduleId,
  )
}

function emitState(
  registry: MessageBusRegistry,
  connection: ConnectionRecord,
  type: string,
  value: unknown,
): void {
  // A written value clears any rejection so later queries resolve normally.
  connection.rejections.delete(type)
  const subject = resolveStateSubject(registry, connection, type)
  if (!Object.is(subject.getValue(), value)) subject.next(value)
}

function query(
  source: MessageBusStateSource<unknown>,
  type: string,
  options: MessageBusQueryOptions | undefined,
  connectionSignal: AbortSignal,
  resetSignal: AbortSignal,
  connection: ConnectionRecord,
): Promise<unknown> {
  const rejection = () => new MessageBusError('REFUSED', connection.rejections.get(type))
  // A rejection outranks any earlier value: it is cleared only when the host writes a new one.
  if (connection.rejections.has(type)) return Promise.reject(rejection())
  const current = source.getCurrent()
  if (current !== undefined) return Promise.resolve(current)

  const signal = scopeSignal(options?.signal, resetSignal, connectionSignal)
  if (signal.aborted) return Promise.reject(new MessageBusError('ABORTED'))
  const timeoutMs = options?.timeout === undefined ? DEFAULT_TIMEOUT_MS : options.timeout
  return new Promise((resolve, reject) => {
    const timer =
      timeoutMs === null
        ? undefined
        : setTimeout(() => {
            clear()
            signal?.removeEventListener('abort', onAbort)
            reject(new MessageBusError('TIMEOUT', `query("${type}") timed out`))
          }, timeoutMs)
    // A rejection that arrives while waiting rejects the pending query at once.
    const rejectedSub = connection.rejected$.subscribe((rejectedType) => {
      if (rejectedType !== type) return
      clear()
      signal?.removeEventListener('abort', onAbort)
      reject(rejection())
    })
    const clear = () => {
      if (timer !== undefined) clearTimeout(timer)
      rejectedSub.unsubscribe()
    }
    const onAbort = () => {
      clear()
      reject(new MessageBusError('ABORTED'))
    }
    signal?.addEventListener('abort', onAbort, {once: true})
    void source.firstValue.then(
      (value) => {
        clear()
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        clear()
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function unsubscribeOnAbort(subscription: Subscription, signal: AbortSignal | undefined): void {
  if (!signal) return
  if (signal.aborted) {
    subscription.unsubscribe()
    return
  }
  signal.addEventListener('abort', () => subscription.unsubscribe(), {
    once: true,
  })
}

function scopeSignal(signal: AbortSignal | undefined, ...lifecycles: AbortSignal[]): AbortSignal {
  return signal ? AbortSignal.any([signal, ...lifecycles]) : AbortSignal.any(lifecycles)
}

function invokeResponder(
  handler: (message: MessageBusMessage<unknown, unknown>) => unknown,
  message: MessageBusMessage<unknown, unknown> & {
    [MESSAGE_BUS_PENDING_REPLY_KEY]?: PendingReply
  },
): void {
  const pendingReply = message[MESSAGE_BUS_PENDING_REPLY_KEY]
  const fail = (error: unknown) => {
    if (pendingReply) {
      settleReply(pendingReply, {
        ok: false,
        error: new MessageBusError('HANDLER_THREW', undefined, {
          cause: error,
        }),
      })
    }
  }
  try {
    const result = handler(message)
    if (result instanceof Promise) result.catch(fail)
  } catch (error) {
    fail(error)
  }
}

function respond(
  registry: MessageBusRegistry,
  type: string,
  handler: (message: MessageBusMessage<unknown, unknown>) => unknown,
  options: MessageBusAbortOptions | undefined,
  appId: string,
  connectionSignal: AbortSignal,
): void {
  const topic = registry.topics.get(type)
  if (topic?.kind === 'event' && !canRespond(registry, topic.ownership, appId)) {
    throw new MessageBusError(
      'OWNERSHIP_MISMATCH',
      `Cannot register a handler for event topic "${type}" from app "${appId}". Only the app that owns this topic can respond to it. Other apps can send it with emit().`,
    )
  }

  registry.responderCounts.set(type, (registry.responderCounts.get(type) ?? 0) + 1)
  const subscription = resolveEventSubject(registry, type).subscribe((message) =>
    invokeResponder(handler, message),
  )
  subscription.add(() => {
    const count = registry.responderCounts.get(type) ?? 0
    if (count > 0) registry.responderCounts.set(type, count - 1)
  })
  unsubscribeOnAbort(
    subscription,
    scopeSignal(options?.signal, registry.resetAbort.signal, connectionSignal),
  )
}

const bundledMigrations = () => new Map(Object.entries(topicMigrations))

/**
 * Creates an isolated message bus without installing it globally and returns the host's
 * connection to it.
 * @internal
 */
export function createIsolatedMessageBus(
  appId: string,
  config: {
    migrations?: ReadonlyMap<string, readonly TopicMigration[]>
  } = {},
): MessageBusHost<Topics> {
  if (!appId) throwMissingAppId()

  const registry: MessageBusRegistry = {
    appId,
    topics: new Map(),
    connections: new Set(),
    connected$: new Subject(),
    eventSubjects: new Map(),
    responderCounts: new Map(),
    migrations: config.migrations ?? bundledMigrations(),
    resetAbort: new AbortController(),
    generation: 0,
  }

  mergeTopicManifest(registry, DASHBOARD_TOPIC_MANIFEST)

  return createConnection(registry, {
    appId,
    migrations: config.migrations,
  }) as MessageBusHost<Topics>
}

type TopicVersionAdapter = {
  toInstalled: (type: string, value: unknown) => unknown
  toApplication: (type: string, value: unknown) => unknown
}

type TopicCompatibility = {
  toInstalledEmission: TopicVersionAdapter['toInstalled']
  toApplicationStateValue: TopicVersionAdapter['toApplication']
  toApplicationEventPayload: TopicVersionAdapter['toApplication']
  toInstalledEventReply: TopicVersionAdapter['toInstalled']
  toApplicationEventReply: TopicVersionAdapter['toApplication']
}

type TopicMigrationTransform = Pick<TopicMigration, 'up' | 'down'>

const identityMigration: TopicMigrationTransform = {
  up: (value) => value,
  down: (value) => value,
}

function effectiveTopicVersions(
  migrations: ReadonlyMap<string, readonly TopicMigration[]>,
): Map<string, number> {
  const versions = new Map<string, number>()
  for (const [topic, steps] of migrations) {
    let version = 1
    for (const step of steps) if (step.to > version) version = step.to
    versions.set(topic, version)
  }
  return versions
}

function migrationTransformAt(
  steps: readonly TopicMigration[] | undefined,
  version: number,
  select: (step: TopicMigration) => TopicMigrationTransform | undefined,
): TopicMigrationTransform {
  const step = steps?.find((candidate) => candidate.from === version)
  return (step ? select(step) : undefined) ?? identityMigration
}

function migrateVersionedValue(
  steps: readonly TopicMigration[] | undefined,
  value: unknown,
  from: number,
  to: number,
  select: (step: TopicMigration) => TopicMigrationTransform | undefined,
): unknown {
  if (from === to) return value

  let current = value
  if (from < to) {
    for (let version = from; version < to; version++) {
      current = migrationTransformAt(steps, version, select).up(current)
    }
  } else {
    for (let version = from; version > to; version--) {
      current = migrationTransformAt(steps, version - 1, select).down(current)
    }
  }
  return current
}

function createTopicCompatibility(
  installedMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
  applicationMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
): TopicCompatibility {
  const installedVersions = effectiveTopicVersions(installedMigrations)
  const applicationVersions = effectiveTopicVersions(applicationMigrations)
  const applicationVersion = (type: string) => applicationVersions.get(type) ?? 1
  const installedVersion = (type: string) => installedVersions.get(type) ?? 1
  const migrationChainFor = (type: string) =>
    (applicationVersion(type) > installedVersion(type)
      ? applicationMigrations
      : installedMigrations
    ).get(type)
  const createVersionAdapter = (
    select: (step: TopicMigration) => TopicMigrationTransform | undefined,
  ): TopicVersionAdapter => ({
    toInstalled: (type, value) =>
      migrateVersionedValue(
        migrationChainFor(type),
        value,
        applicationVersion(type),
        installedVersion(type),
        select,
      ),
    toApplication: (type, value) =>
      migrateVersionedValue(
        migrationChainFor(type),
        value,
        installedVersion(type),
        applicationVersion(type),
        select,
      ),
  })

  const stateValueAndEventPayload = createVersionAdapter((step) => step)
  const eventReply = createVersionAdapter((step) => step.reply)
  return {
    toInstalledEmission: stateValueAndEventPayload.toInstalled,
    toApplicationStateValue: stateValueAndEventPayload.toApplication,
    toApplicationEventPayload: stateValueAndEventPayload.toApplication,
    toInstalledEventReply: eventReply.toInstalled,
    toApplicationEventReply: eventReply.toApplication,
  }
}

// Cache projections by input reference to keep state snapshots stable.
function projectCurrent(input: () => unknown, project: (value: unknown) => unknown): () => unknown {
  let lastInput: unknown
  let lastOutput: unknown
  let cached = false
  return () => {
    const current = input()
    if (current === undefined) return undefined
    if (!cached || current !== lastInput) {
      lastInput = current
      lastOutput = project(current)
      cached = true
    }
    return lastOutput
  }
}

// The connection's view of one of its state boxes, in the connection's topic version.
function createStateSource(
  subject: BehaviorSubject<unknown>,
  project: (value: unknown) => unknown,
  completeOn: Observable<unknown>,
): MessageBusStateSource<unknown> {
  const getCurrent = () => {
    const current = subject.getValue()
    return current === NO_VALUE ? undefined : current
  }
  return toStateSource(
    subject.pipe(
      filter((value) => value !== NO_VALUE),
      map(project),
      takeUntil(completeOn),
    ),
    projectCurrent(getCurrent, project),
  )
}

function migrateEventMessage(
  message: MessageBusMessage<unknown, unknown>,
  payload: (value: unknown) => unknown,
  reply: (value: unknown) => unknown,
): MessageBusMessage<unknown, unknown> {
  return {
    type: message.type,
    payload: payload(message.payload),
    meta: message.meta,
    reply: (value) => message.reply(reply(value)),
    reject: (reason) => message.reject(reason),
    get signal() {
      return message.signal
    },
  }
}

function migrateEventReply(
  result: MessageBusEmitResult<unknown>,
  project: (value: unknown) => unknown,
): MessageBusEmitResult<unknown> {
  let projected: Promise<unknown> | undefined
  return createLazyReply(() => (projected ??= Promise.resolve(result).then(project)))
}

function createRejectedConnection(
  appId: string,
  connectionError: () => unknown,
): MessageBusConnection {
  const throwConnectionError = (): never => {
    throw connectionError()
  }
  return {
    appId,
    emit: throwConnectionError,
    // `query` is typed as a Promise, so it must reject rather than throw synchronously.
    query: () => Promise.reject(connectionError()),
    subscribe: throwConnectionError,
    disconnect: () => {},
  } as unknown as MessageBusConnection
}

/**
 * Options for connecting an application to an isolated message bus.
 * @internal
 */
export interface ConnectApplicationToMessageBusOptions {
  /** The application ID stamped on emitted messages. */
  appId: string
  /** The federation module id stamped on emitted messages. Defaults to `appId`. */
  moduleId?: string
  /** The topic migrations supported by the application. */
  migrations?: ReadonlyMap<string, readonly TopicMigration[]>
}

/**
 * Connects an application to an isolated message bus.
 * @internal
 */
export function connectApplicationToMessageBus(
  installedMessageBus: MessageBus,
  config: ConnectApplicationToMessageBusOptions,
): MessageBusConnection<Topics> {
  if (!config.appId) throwMissingAppId()

  const {appId} = config
  const installedProtocol = (installedMessageBus as Partial<InternalMessageBus>)[
    MESSAGE_BUS_PROTOCOL_KEY
  ]
  if (installedProtocol !== MESSAGE_BUS_PROTOCOL) {
    console.error(
      `[sanity-sdk:message-bus] protocol mismatch for "${appId}": installed ${String(installedProtocol)}, this copy speaks ${MESSAGE_BUS_PROTOCOL}`,
    )
    return createRejectedConnection(
      appId,
      () =>
        new MessageBusError(
          'PROTOCOL_MISMATCH',
          `installed message bus speaks protocol ${String(installedProtocol)}, this copy speaks ${MESSAGE_BUS_PROTOCOL}`,
        ),
    )
  }

  const registry = (installedMessageBus as Partial<InternalMessageBus>)[MESSAGE_BUS_REGISTRY_KEY]
  if (!registry) {
    console.error(`[sanity-sdk:message-bus] incompatible message bus for "${appId}"`)
    return createRejectedConnection(
      appId,
      () =>
        new MessageBusError(
          'PROTOCOL_MISMATCH',
          'installed message bus does not expose a compatible registry',
        ),
    )
  }

  try {
    mergeTopicManifest(registry, DASHBOARD_TOPIC_MANIFEST)
  } catch (error) {
    console.error(`[sanity-sdk:message-bus] topic manifest conflict for "${appId}"`, {error})
    return createRejectedConnection(appId, () => error)
  }

  return createConnection(registry, config) as MessageBusConnection<Topics>
}

// Hands the host the same client object for a connection across `connections` subscriptions.
function createClient(
  registry: MessageBusRegistry,
  record: ConnectionRecord,
  compatibility: TopicCompatibility,
): MessageBusClient {
  return {
    appId: record.appId,
    moduleId: record.moduleId,
    closed: record.abort.signal,
    emit: (type: string, value: unknown) => {
      if (record.abort.signal.aborted) {
        console.warn(
          `[sanity-sdk:message-bus] "${type}" not written: connection "${record.moduleId}" has closed`,
        )
        return
      }
      emitState(registry, record, type, compatibility.toInstalledEmission(type, value))
    },
    reject: (type: string, message?: string) => {
      if (record.abort.signal.aborted) return
      record.rejections.set(type, message)
      record.rejected$.next(type)
    },
  } as MessageBusClient
}

// Open connections other than the host's own first, then each new one; one client object per
// connection so the host can keep them in a Set. Completes when the host connection disconnects.
function createConnectionsSource(
  registry: MessageBusRegistry,
  self: ConnectionRecord,
  compatibility: TopicCompatibility,
  completeOn: Observable<unknown>,
): Observable<MessageBusClient> {
  const clients = new WeakMap<ConnectionRecord, MessageBusClient>()
  const clientFor = (record: ConnectionRecord) => {
    let client = clients.get(record)
    if (!client) {
      client = createClient(registry, record, compatibility)
      clients.set(record, client)
    }
    return client
  }
  return defer(() => concat(from([...registry.connections]), registry.connected$)).pipe(
    filter((record) => record !== self),
    map(clientFor),
    takeUntil(completeOn),
  )
}

function createConnection(
  registry: MessageBusRegistry,
  config: ConnectApplicationToMessageBusOptions,
): MessageBusConnection {
  const {appId} = config
  const moduleId = config.moduleId ?? appId
  // Each connection owns its lifetime; disconnect() aborts it without touching siblings.
  const connectionAbort = new AbortController()
  const connectionSignal = connectionAbort.signal
  // ReplaySubject, not fromEvent: `abort` fires once, so a cold listener attached by a
  // stream subscribed after disconnect() would never see it and never complete. Replaying
  // the notification lets those late subscribers complete immediately.
  const connectionAborted$ = new ReplaySubject<void>(1)
  connectionSignal.addEventListener('abort', () => connectionAborted$.next(), {once: true})

  const record: ConnectionRecord = {
    appId,
    moduleId,
    stateSubjects: new Map(),
    rejections: new Map(),
    rejected$: new Subject<string>(),
    abort: connectionAbort,
  }

  const compatibility = createTopicCompatibility(
    registry.migrations,
    config.migrations ?? bundledMigrations(),
  )
  const isState = (type: string) => isStateTopic(registry, type)

  // Reuse topic streams because React external-store snapshots require stable references.
  const applicationStreams = new Map<string, MessageBusStateSource<unknown> | Observable<unknown>>()
  let streamGeneration = registry.generation
  const cachedStream = <T extends MessageBusStateSource<unknown> | Observable<unknown>>(
    type: string,
    create: () => T,
  ): T => {
    if (streamGeneration !== registry.generation) {
      applicationStreams.clear()
      streamGeneration = registry.generation
    }
    let stream = applicationStreams.get(type)
    if (!stream) {
      stream = create()
      applicationStreams.set(type, stream)
    }
    return stream as T
  }
  const stateSource = (type: string) =>
    cachedStream(type, () =>
      createStateSource(
        resolveStateSubject(registry, record, type),
        (value) => compatibility.toApplicationStateValue(type, value),
        connectionAborted$,
      ),
    )
  const eventStream = (type: string) =>
    cachedStream(type, () =>
      resolveEventSubject(registry, type).pipe(
        map((message) => compatibility.toApplicationEventPayload(type, message.payload)),
        takeUntil(connectionAborted$),
      ),
    )

  // A disconnected connection must not reach siblings, so its operations fail before touching
  // the shared registry rather than only tearing down pending requests and subscriptions.
  const throwIfDisconnected = () => {
    if (connectionSignal.aborted) throw new MessageBusError('ABORTED')
  }

  const connection = {
    appId,
    emit: (type: string, payload: unknown, options?: MessageBusEmitOptions) => {
      throwIfDisconnected()
      return migrateEventReply(
        emit(
          registry,
          type,
          compatibility.toInstalledEmission(type, payload),
          options,
          appId,
          moduleId,
          connectionSignal,
        ),
        (value) => compatibility.toApplicationEventReply(type, value),
      )
    },
    query: (type: string, options?: MessageBusQueryOptions) => {
      if (connectionSignal.aborted) return Promise.reject(new MessageBusError('ABORTED'))
      return query(
        stateSource(type),
        type,
        options,
        connectionSignal,
        registry.resetAbort.signal,
        record,
      )
    },
    subscribe: (
      type: string,
      handler?: (arg: never) => void,
      options?: MessageBusAbortOptions,
    ): MessageBusStateSource<unknown> | Observable<unknown> | undefined => {
      throwIfDisconnected()
      if (isState(type)) {
        const source = stateSource(type)
        if (!handler) return source
        unsubscribeOnAbort(
          source.subscribe(handler as (value: unknown) => void),
          scopeSignal(options?.signal, registry.resetAbort.signal, connectionSignal),
        )
        return undefined
      }
      if (!handler) return eventStream(type)
      respond(
        registry,
        type,
        (message) =>
          (handler as (message: MessageBusMessage<unknown, unknown>) => void)(
            migrateEventMessage(
              message,
              (value) => compatibility.toApplicationEventPayload(type, value),
              (value) => compatibility.toInstalledEventReply(type, value),
            ),
          ),
        options,
        appId,
        connectionSignal,
      )
      return undefined
    },
    disconnect: () => {
      if (connectionSignal.aborted) return
      connectionAbort.abort()
      for (const subject of record.stateSubjects.values()) subject.complete()
      record.stateSubjects.clear()
      record.rejected$.complete()
      registry.connections.delete(record)
    },
  }

  if (appId === registry.appId) {
    Object.assign(connection, {
      connections: createConnectionsSource(registry, record, compatibility, connectionAborted$),
    })
  }

  const instance = connection as unknown as InternalMessageBus
  instance[MESSAGE_BUS_REGISTRY_KEY] = registry
  instance[MESSAGE_BUS_PROTOCOL_KEY] = MESSAGE_BUS_PROTOCOL

  // Announce last: a host subscriber may write to the new client synchronously.
  registry.connections.add(record)
  registry.connected$.next(record)
  return instance as unknown as MessageBusConnection
}

function reset(registry: MessageBusRegistry): void {
  registry.resetAbort.abort()
  for (const connection of registry.connections) {
    for (const subject of connection.stateSubjects.values()) subject.complete()
    connection.stateSubjects.clear()
    connection.rejections.clear()
  }
  for (const subject of registry.eventSubjects.values()) subject.complete()

  registry.topics.clear()
  registry.eventSubjects.clear()
  registry.responderCounts.clear()
  registry.resetAbort = new AbortController()
  registry.generation += 1
  mergeTopicManifest(registry, DASHBOARD_TOPIC_MANIFEST)
}

declare const __SANITY_APP_ID__: string | undefined

function throwMissingAppId(): never {
  throw new MessageBusError(
    'MISSING_APP_ID',
    'Cannot initialize the message bus without an app ID. Build the application with the Sanity CLI or pass an app ID when connecting.',
  )
}

const resolveAppId = (appId?: string): string | undefined =>
  appId ?? (typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : undefined)

function getInstalledMessageBus(): MessageBus | undefined {
  const bus = (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
  return typeof bus === 'object' && bus !== null && MESSAGE_BUS_REGISTRY_KEY in bus
    ? (bus as unknown as MessageBus)
    : undefined
}

/**
 * Returns whether a message bus registry is installed.
 * @internal
 */
export function isMessageBusInstalled(): boolean {
  return getInstalledMessageBus() !== undefined
}

/**
 * Options for connecting to an installed message bus.
 * @public
 */
export interface ConnectMessageBusOptions {
  /** The application ID. Defaults to the ID embedded by the Sanity CLI. */
  appId?: string
  /** The federation module id stamped on emitted messages. Defaults to `appId`. */
  moduleId?: string
}

/**
 * Connects to the installed message bus, or returns `undefined` when no compatible connection exists.
 * @public
 */
export function connectMessageBus(
  options: ConnectMessageBusOptions = {},
): MessageBusConnection | undefined {
  const installedMessageBus = getInstalledMessageBus()
  if (!installedMessageBus) return undefined

  const appId = resolveAppId(options.appId)
  if (!appId) {
    console.warn(
      '[sanity-sdk:message-bus] cannot connect without an app ID; build with the Sanity CLI or pass appId',
    )
    return undefined
  }

  const connection = connectApplicationToMessageBus(installedMessageBus, {
    appId,
    moduleId: options.moduleId,
  })
  return MESSAGE_BUS_REGISTRY_KEY in connection ? connection : undefined
}

/**
 * Resets the installed message bus for test isolation.
 * @internal
 */
export function resetMessageBus(): void {
  const installedMessageBus = getInstalledMessageBus()
  if (!installedMessageBus) return
  reset((installedMessageBus as InternalMessageBus)[MESSAGE_BUS_REGISTRY_KEY])
}

/**
 * Options for installing the shared message bus. The host is the whole app, so it carries
 * no `moduleId`.
 * @internal
 */
export interface InstallMessageBusOptions {
  /** The application ID. Defaults to the ID embedded by the Sanity CLI. */
  appId?: string
}

/**
 * Installs the shared message bus and returns the host's connection, or connects to its
 * existing installation. Only the host calls this; another app's ID is rejected because the
 * connection it would get has no `connections`.
 * @internal
 */
export function installMessageBus(options: InstallMessageBusOptions = {}): MessageBusHost<Topics> {
  const appId = resolveAppId(options.appId) ?? throwMissingAppId()
  const installedMessageBus = getInstalledMessageBus()
  if (installedMessageBus) {
    const installedAppId = (installedMessageBus as InternalMessageBus)[MESSAGE_BUS_REGISTRY_KEY]
      .appId
    if (installedAppId !== appId) {
      throw new MessageBusError(
        'OWNERSHIP_MISMATCH',
        `Cannot install the message bus as "${appId}": it is already installed by "${installedAppId}". Applications connect with connectMessageBus().`,
      )
    }
    return connectApplicationToMessageBus(installedMessageBus, {
      appId,
    }) as MessageBusHost<Topics>
  }

  const globals = globalThis as {[MESSAGE_BUS_KEY]?: MessageBus}
  if (globals[MESSAGE_BUS_KEY]) {
    // A foreign value already occupies the bus symbol (e.g. an older Workbench bus); overwriting it disconnects that bus.
    console.error(
      '[sanity-sdk:message-bus] overwriting an incompatible message bus already installed',
    )
  }
  const host = createIsolatedMessageBus(appId)
  globals[MESSAGE_BUS_KEY] = host
  return host
}

/**
 * Declares state topics that are not in the bundled manifest, with the seed a new
 * connection's box starts from.
 * @internal
 */
export function registerStateTopics(
  target: MessageBus,
  topics: Partial<{[K in StateTopic]: ValueOf<K> | undefined}>,
): void {
  const registry = (target as InternalMessageBus)[MESSAGE_BUS_REGISTRY_KEY]
  const manifest: TopicManifest = Object.fromEntries(
    Object.entries(topics).map(([name, seed]) => [name, {kind: 'state', seed}]),
  )
  mergeTopicManifest(registry, manifest)
}

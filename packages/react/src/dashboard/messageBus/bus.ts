/* eslint-disable no-console -- The bus can initialize before the SDK logger exists. */
import {type Application} from '@sanity/sdk'
import {
  BehaviorSubject,
  filter,
  firstValueFrom,
  map,
  type Observable,
  Subject,
  type Subscription,
} from 'rxjs'

import {
  DASHBOARD_TOPIC_MANIFEST,
  type EventTopic,
  type PayloadOf,
  type ReplyOf,
  type StateTopic,
  type TopicManifest,
  type TopicMigration,
  topicMigrations,
  type TopicName,
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
  /** The Unix timestamp in milliseconds when the message was produced. */
  timestamp: number
}

/**
 * A message delivered to an event topic responder.
 * @public
 */
export interface MessageBusMessage<T, R = never> {
  /** The topic that carries the message. */
  type: TopicName
  /** The event payload. */
  payload: T
  /** The message provenance. */
  meta: MessageBusMeta
  /** Replies to an awaiting sender. */
  reply(value: R): void
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
 * Publishes, reads, and subscribes to typed state and event topics.
 * @public
 */
export interface MessageBus {
  /** Publishes the current value of a state topic. */
  emit<K extends StateTopic>(type: K, value: ValueOf<K>): void
  /** Emits an event topic and provides its reply when awaited. */
  emit<K extends EventTopic>(
    type: K,
    ...rest: PayloadOf<K> extends void
      ? [payload?: void, options?: MessageBusEmitOptions]
      : [payload: PayloadOf<K>, options?: MessageBusEmitOptions]
  ): MessageBusEmitResult<ReplyOf<K>>
  /** Reads the current or next value of a state topic. */
  query<K extends StateTopic>(type: K, options?: MessageBusAbortOptions): Promise<ValueOf<K>>
  /** Runs a responder for each event until its signal aborts. */
  subscribe<K extends EventTopic>(
    type: K,
    handler: (message: MessageBusMessage<PayloadOf<K>, ReplyOf<K>>) => void,
    options?: MessageBusAbortOptions,
  ): void
  /** Runs a handler for each state value until its signal aborts. */
  subscribe<K extends StateTopic>(
    type: K,
    handler: (value: ValueOf<K>) => void,
    options?: MessageBusAbortOptions,
  ): void
  /** Returns a state topic as a `MessageBusStateSource`. */
  subscribe<K extends StateTopic>(type: K): MessageBusStateSource<ValueOf<K>>
  /** Returns an event topic as an observable of its payloads. */
  subscribe<K extends EventTopic>(type: K): Observable<PayloadOf<K>>
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

interface MessageBusRegistry {
  readonly appId: string
  readonly topics: Map<string, TopicManifest[string]>
  readonly stateSubjects: Map<string, BehaviorSubject<unknown>>
  readonly stateSources: Map<string, MessageBusStateSource<unknown>>
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

function resolveStateSubject(registry: MessageBusRegistry, type: string): BehaviorSubject<unknown> {
  let subject = registry.stateSubjects.get(type)
  if (!subject) {
    console.warn(
      `[sanity-sdk:message-bus] state topic "${type}" read before any value was published`,
    )
    subject = new BehaviorSubject<unknown>(NO_VALUE)
    registry.stateSubjects.set(type, subject)
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

function resolveStateSource(
  registry: MessageBusRegistry,
  type: string,
): MessageBusStateSource<unknown> {
  // React external-store snapshots require the source reference to remain stable until reset.
  let source = registry.stateSources.get(type)
  if (!source) {
    const subject = resolveStateSubject(registry, type)
    source = toStateSource(subject.pipe(filter((value) => value !== NO_VALUE)), () => {
      const current = subject.getValue()
      return current === NO_VALUE ? undefined : current
    })
    registry.stateSources.set(type, source)
  }
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
    if (existing && existing.ownership.type !== entry.ownership.type) {
      throw new MessageBusError('OWNERSHIP_MISMATCH', `topic "${type}" has conflicting ownership`)
    }
  }
}

function mergeTopicManifest(
  registry: MessageBusRegistry,
  manifest: TopicManifest,
  {reseed = false}: {reseed?: boolean} = {},
): void {
  assertCompatibleTopicManifest(registry, manifest)
  for (const [type, entry] of Object.entries(manifest)) {
    registry.topics.set(type, entry)
    if (entry.kind !== 'state') continue

    const subject = registry.stateSubjects.get(type)
    if (!subject) {
      registry.stateSubjects.set(
        type,
        new BehaviorSubject<unknown>(entry.seed === undefined ? NO_VALUE : entry.seed),
      )
      continue
    }
    if (reseed && entry.seed !== undefined && !Object.is(subject.getValue(), entry.seed)) {
      subject.next(entry.seed)
    }
  }
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
  type: string,
  payload: unknown,
  pendingReply: PendingReply,
): MessageBusMessage<unknown, unknown> {
  const message: MessageBusMessage<unknown, unknown> & {
    [MESSAGE_BUS_PENDING_REPLY_KEY]?: PendingReply
  } = {
    type: type as TopicName,
    payload,
    meta: {appId, timestamp: Date.now()},
    reply: (value) => {
      if (pendingReply.settled) {
        console.warn(
          `[sanity-sdk:message-bus] reply ignored for "${type}": no waiting caller or already replied`,
        )
        return
      }
      settleReply(pendingReply, {ok: true, value})
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
): MessageBusEmitResult<unknown> {
  const hadResponderAtEmission = (registry.responderCounts.get(type) ?? 0) > 0
  const responderAbort = new AbortController()
  const pendingReply: PendingReply = {
    responderAbort,
    responderSignal: scopeSignal(options?.signal, responderAbort.signal),
    settled: false,
  }

  resolveEventSubject(registry, type).next(createEventMessage(appId, type, payload, pendingReply))

  const awaitReply = () =>
    (pendingReply.replyPromise ??= createReplyPromise(pendingReply, {
      ...options,
      hadResponderAtEmission,
    }))
  return createLazyReply(awaitReply)
}

const isStateTopic = (registry: MessageBusRegistry, type: string): boolean =>
  registry.topics.get(type)?.kind === 'state'

const canPublishOrRespond = (
  registry: MessageBusRegistry,
  ownership: TopicManifest[string]['ownership'],
  appId: string,
): boolean => ownership.type === 'any_app' || appId === registry.appId

function emit(
  registry: MessageBusRegistry,
  type: string,
  payload: unknown,
  options: MessageBusEmitOptions | undefined,
  appId: string,
): MessageBusEmitResult<unknown> | undefined {
  const topic = registry.topics.get(type)
  if (topic?.kind === 'state') {
    if (!canPublishOrRespond(registry, topic.ownership, appId)) {
      throw new MessageBusError(
        'OWNERSHIP_MISMATCH',
        `Cannot emit state topic "${type}" from app "${appId}". Only the app that owns this topic can publish it. Other apps can read it with query() or subscribe().`,
      )
    }
    const subject = resolveStateSubject(registry, type)
    if (!Object.is(subject.getValue(), payload)) subject.next(payload)
    return undefined
  }
  return emitEvent(
    registry,
    type,
    payload,
    {
      ...options,
      signal: scopeSignal(options?.signal, registry.resetAbort.signal),
    },
    appId,
  )
}

function query(
  registry: MessageBusRegistry,
  type: string,
  options: MessageBusAbortOptions | undefined,
): Promise<unknown> {
  const source = resolveStateSource(registry, type)
  const current = source.getCurrent()
  if (current !== undefined) return Promise.resolve(current)

  const signal = scopeSignal(options?.signal, registry.resetAbort.signal)
  if (signal?.aborted) return Promise.reject(new MessageBusError('ABORTED'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new MessageBusError('TIMEOUT', `query("${type}") timed out`)),
      DEFAULT_TIMEOUT_MS,
    )
    const onAbort = () => {
      clearTimeout(timer)
      reject(new MessageBusError('ABORTED'))
    }
    signal?.addEventListener('abort', onAbort, {once: true})
    void source.firstValue.then(
      (value) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
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

function scopeSignal(signal: AbortSignal | undefined, lifecycle: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, lifecycle]) : lifecycle
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

function subscribe(
  registry: MessageBusRegistry,
  type: string,
  handler: ((arg: never) => void) | undefined,
  options: MessageBusAbortOptions | undefined,
  appId: string,
): MessageBusStateSource<unknown> | Observable<unknown> | void {
  const isState = isStateTopic(registry, type)

  if (!handler) {
    return isState
      ? resolveStateSource(registry, type)
      : resolveEventSubject(registry, type).pipe(map((message) => message.payload))
  }

  if (isState) {
    const subscription = resolveStateSource(registry, type).subscribe(
      handler as (value: unknown) => void,
    )
    unsubscribeOnAbort(subscription, scopeSignal(options?.signal, registry.resetAbort.signal))
    return
  }

  const topic = registry.topics.get(type)
  if (topic && !canPublishOrRespond(registry, topic.ownership, appId)) {
    throw new MessageBusError(
      'OWNERSHIP_MISMATCH',
      `Cannot register a handler for event topic "${type}" from app "${appId}". Only the app that owns this topic can respond to it. Other apps can send it with emit().`,
    )
  }

  registry.responderCounts.set(type, (registry.responderCounts.get(type) ?? 0) + 1)
  const subscription = resolveEventSubject(registry, type).subscribe((message) =>
    invokeResponder(handler as (message: MessageBusMessage<unknown, unknown>) => unknown, message),
  )
  subscription.add(() => {
    const count = registry.responderCounts.get(type) ?? 0
    if (count > 0) registry.responderCounts.set(type, count - 1)
  })
  unsubscribeOnAbort(subscription, scopeSignal(options?.signal, registry.resetAbort.signal))
}

const bundledMigrations = () => new Map(Object.entries(topicMigrations))

/**
 * Creates an isolated message bus without installing it globally.
 * @internal
 */
export function createIsolatedMessageBus(
  appId: string,
  config: {
    migrations?: ReadonlyMap<string, readonly TopicMigration[]>
  } = {},
): MessageBus {
  if (!appId) throwMissingAppId()

  const registry: MessageBusRegistry = {
    appId,
    topics: new Map(),
    stateSubjects: new Map(),
    stateSources: new Map(),
    eventSubjects: new Map(),
    responderCounts: new Map(),
    migrations: config.migrations ?? bundledMigrations(),
    resetAbort: new AbortController(),
    generation: 0,
  }

  mergeTopicManifest(registry, DASHBOARD_TOPIC_MANIFEST)

  const messageBus = {
    emit: (type: string, payload: unknown, options?: MessageBusEmitOptions) =>
      emit(registry, type, payload, options, registry.appId),
    query: (type: string, options?: MessageBusAbortOptions) => query(registry, type, options),
    subscribe: (type: string, handler?: (arg: never) => void, options?: MessageBusAbortOptions) =>
      subscribe(registry, type, handler, options, registry.appId),
  }

  const instance = messageBus as unknown as InternalMessageBus
  instance[MESSAGE_BUS_REGISTRY_KEY] = registry
  instance[MESSAGE_BUS_PROTOCOL_KEY] = MESSAGE_BUS_PROTOCOL
  return instance
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

function mapStateSource(
  source: MessageBusStateSource<unknown>,
  project: (value: unknown) => unknown,
): MessageBusStateSource<unknown> {
  return toStateSource(source.pipe(map(project)), projectCurrent(source.getCurrent, project))
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
    get signal() {
      return message.signal
    },
  }
}

function migrateEventReply(
  result: MessageBusEmitResult<unknown> | undefined,
  project: (value: unknown) => unknown,
): MessageBusEmitResult<unknown> | undefined {
  if (!result) return undefined
  let projected: Promise<unknown> | undefined
  return createLazyReply(() => (projected ??= Promise.resolve(result).then(project)))
}

function createRejectedConnection(throwConnectionError: () => never): MessageBus {
  return {
    emit: throwConnectionError,
    query: throwConnectionError,
    subscribe: throwConnectionError,
  } as unknown as MessageBus
}

/**
 * Options for connecting an application to an isolated message bus.
 * @internal
 */
export interface ConnectApplicationToMessageBusOptions {
  /** The application ID stamped on emitted messages. */
  appId: string
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
): MessageBus {
  if (!config.appId) throwMissingAppId()

  const {appId} = config
  const installedProtocol = (installedMessageBus as Partial<InternalMessageBus>)[
    MESSAGE_BUS_PROTOCOL_KEY
  ]
  if (installedProtocol !== MESSAGE_BUS_PROTOCOL) {
    console.error(
      `[sanity-sdk:message-bus] protocol mismatch for "${appId}": installed ${String(installedProtocol)}, this copy speaks ${MESSAGE_BUS_PROTOCOL}`,
    )
    return createRejectedConnection(() => {
      throw new MessageBusError(
        'PROTOCOL_MISMATCH',
        `installed message bus speaks protocol ${String(installedProtocol)}, this copy speaks ${MESSAGE_BUS_PROTOCOL}`,
      )
    })
  }

  const registry = (installedMessageBus as Partial<InternalMessageBus>)[MESSAGE_BUS_REGISTRY_KEY]
  if (!registry) {
    console.error(`[sanity-sdk:message-bus] incompatible message bus for "${appId}"`)
    return createRejectedConnection(() => {
      throw new MessageBusError(
        'PROTOCOL_MISMATCH',
        'installed message bus does not expose a compatible registry',
      )
    })
  }

  const applicationMigrations = config.migrations ?? bundledMigrations()

  try {
    mergeTopicManifest(registry, DASHBOARD_TOPIC_MANIFEST)
  } catch (error) {
    console.error(`[sanity-sdk:message-bus] topic manifest conflict for "${appId}"`, {error})
    return createRejectedConnection(() => {
      throw error
    })
  }
  const compatibility = createTopicCompatibility(registry.migrations, applicationMigrations)
  const isState = (type: string) => isStateTopic(registry, type)

  // Reuse topic streams because React external-store snapshots require stable references.
  const applicationStreams = new Map<string, MessageBusStateSource<unknown> | Observable<unknown>>()
  let streamGeneration = registry.generation

  const connection = {
    emit: (type: string, payload: unknown, options?: MessageBusEmitOptions) =>
      migrateEventReply(
        emit(registry, type, compatibility.toInstalledEmission(type, payload), options, appId),
        (value) => compatibility.toApplicationEventReply(type, value),
      ),
    query: (type: string, options?: MessageBusAbortOptions) =>
      query(registry, type, options).then((value) =>
        compatibility.toApplicationStateValue(type, value),
      ),
    subscribe: (type: string, handler?: (arg: never) => void, options?: MessageBusAbortOptions) => {
      if (!handler) {
        if (streamGeneration !== registry.generation) {
          applicationStreams.clear()
          streamGeneration = registry.generation
        }
        let stream = applicationStreams.get(type)
        if (!stream) {
          const installedSource = subscribe(registry, type, undefined, options, appId)
          stream = isState(type)
            ? mapStateSource(installedSource as MessageBusStateSource<unknown>, (value) =>
                compatibility.toApplicationStateValue(type, value),
              )
            : (installedSource as Observable<unknown>).pipe(
                map((payload) => compatibility.toApplicationEventPayload(type, payload)),
              )
          applicationStreams.set(type, stream)
        }
        return stream
      }
      const applicationHandler = isState(type)
        ? (value: unknown) =>
            (handler as (value: unknown) => void)(
              compatibility.toApplicationStateValue(type, value),
            )
        : (message: MessageBusMessage<unknown, unknown>) =>
            (handler as (message: MessageBusMessage<unknown, unknown>) => void)(
              migrateEventMessage(
                message,
                (value) => compatibility.toApplicationEventPayload(type, value),
                (value) => compatibility.toInstalledEventReply(type, value),
              ),
            )
      return subscribe(registry, type, applicationHandler as (arg: never) => void, options, appId)
    },
  }

  const instance = connection as unknown as InternalMessageBus
  instance[MESSAGE_BUS_REGISTRY_KEY] = registry
  instance[MESSAGE_BUS_PROTOCOL_KEY] = MESSAGE_BUS_PROTOCOL
  return instance
}

function reset(registry: MessageBusRegistry): void {
  registry.resetAbort.abort()
  for (const subject of registry.stateSubjects.values()) subject.complete()
  for (const subject of registry.eventSubjects.values()) subject.complete()

  registry.topics.clear()
  registry.stateSubjects.clear()
  registry.stateSources.clear()
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
}

/**
 * Connects to the installed message bus, or returns `undefined` when no compatible connection exists.
 * @public
 */
export function connectMessageBus(options: ConnectMessageBusOptions = {}): MessageBus | undefined {
  const installedMessageBus = getInstalledMessageBus()
  if (!installedMessageBus) return undefined

  const appId = resolveAppId(options.appId)
  if (!appId) return undefined

  const connection = connectApplicationToMessageBus(installedMessageBus, {appId})
  return MESSAGE_BUS_REGISTRY_KEY in connection ? connection : undefined
}

/**
 * Resets the installed message bus for test isolation.
 * @public
 */
export function resetMessageBus(): void {
  const installedMessageBus = getInstalledMessageBus()
  if (!installedMessageBus) return
  reset((installedMessageBus as InternalMessageBus)[MESSAGE_BUS_REGISTRY_KEY])
}

/**
 * Installs the shared message bus or connects to its existing installation.
 * @internal
 */
export function installMessageBus(options: ConnectMessageBusOptions = {}): MessageBus {
  const appId = resolveAppId(options.appId) ?? throwMissingAppId()
  const installedMessageBus = getInstalledMessageBus()
  if (installedMessageBus) return connectApplicationToMessageBus(installedMessageBus, {appId})

  const globals = globalThis as {[MESSAGE_BUS_KEY]?: MessageBus}
  if (globals[MESSAGE_BUS_KEY]) {
    console.warn('[sanity-sdk:message-bus] message bus already installed')
  }
  globals[MESSAGE_BUS_KEY] = createIsolatedMessageBus(appId)
  return connectApplicationToMessageBus(globals[MESSAGE_BUS_KEY], {appId})
}

/**
 * Registers or reseeds state topics, preserving existing ownership and sharing new topics by default.
 * @internal
 */
export function registerStateTopics(
  target: MessageBus,
  topics: Partial<{[K in StateTopic]: ValueOf<K> | undefined}>,
  options: {ownership?: 'same_app' | 'any_app'} = {},
): void {
  const registry = (target as InternalMessageBus)[MESSAGE_BUS_REGISTRY_KEY]
  const manifest: TopicManifest = Object.fromEntries(
    Object.entries(topics).map(([name, seed]) => [
      name,
      {
        kind: 'state',
        ownership: registry.topics.get(name)?.ownership ?? {
          type: options.ownership ?? 'any_app',
        },
        seed,
      },
    ]),
  )
  mergeTopicManifest(registry, manifest, {reseed: true})
}

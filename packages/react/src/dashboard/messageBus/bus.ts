/* eslint-disable no-console -- The bus can initialize before the SDK logger exists. */
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
 * Identifies the application and time that produced a message.
 * @public
 */
export interface MessageBusMeta {
  /** The application that produced the message. */
  appId: string
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
  firstValue: Promise<T>
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

// These registered keys are the protocol seam shared by independently bundled SDK copies.
const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
const MESSAGE_BUS_PROTOCOL_KEY = Symbol.for('sanity.os.protocol')
const MESSAGE_BUS_REGISTRY_KEY = Symbol.for('sanity.os.registry')
const MESSAGE_BUS_REQUEST_KEY = Symbol.for('sanity.os.request')

// Older SDK copies use this fixed marker to recognize the shared registry.
const LEGACY_MESSAGE_BUS_PROTOCOL = 1

const DEFAULT_TIMEOUT_MS = 5000

// Distinguishes an unpublished topic from a published `undefined` value.
const NO_VALUE = Symbol.for('sanity.os.no-value')

type Outcome =
  | {readonly ok: true; readonly value: unknown}
  | {readonly ok: false; readonly error: unknown}

// Defers Promise creation until the request is awaited to preserve fire-and-forget emission.
interface PendingRequest {
  readonly responderAbort: AbortController
  readonly responderSignal: AbortSignal
  settled: boolean
  capturedOutcome?: Outcome
  deliver?: (outcome: Outcome) => void
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

// Cache this source because React external-store snapshots require stable references.
function toStateSource(
  values: Observable<unknown>,
  getCurrent: () => unknown,
): MessageBusStateSource<unknown> {
  const source = values as MessageBusStateSource<unknown>
  source.getCurrent = getCurrent
  source.firstValue = firstValueFrom(values)
  return source
}

function resolveStateSource(
  registry: MessageBusRegistry,
  type: string,
): MessageBusStateSource<unknown> {
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

function validateTopics(registry: MessageBusRegistry, manifest: TopicManifest): void {
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

function registerTopics(
  registry: MessageBusRegistry,
  manifest: TopicManifest,
  {reseed = false}: {reseed?: boolean} = {},
): void {
  validateTopics(registry, manifest)
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

function settle(request: PendingRequest, outcome: Outcome): void {
  if (request.settled) return
  request.settled = true
  if (request.deliver) request.deliver(outcome)
  else request.capturedOutcome = outcome
}

function createMessage(
  appId: string,
  type: string,
  payload: unknown,
  request: PendingRequest,
): MessageBusMessage<unknown, unknown> {
  const message: MessageBusMessage<unknown, unknown> & {
    [MESSAGE_BUS_REQUEST_KEY]?: PendingRequest
  } = {
    type: type as TopicName,
    payload,
    meta: {appId, timestamp: Date.now()},
    reply: (value) => {
      if (request.settled) {
        console.warn(
          `[sanity-sdk:message-bus] reply ignored for "${type}": no waiting caller or already replied`,
        )
        return
      }
      settle(request, {ok: true, value})
    },
    get signal() {
      return request.responderSignal
    },
  }

  message[MESSAGE_BUS_REQUEST_KEY] = request
  return message
}

function createReplyPromise(
  request: PendingRequest,
  options: MessageBusEmitOptions & {hadResponder: boolean},
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const deliver = (outcome: Outcome) =>
      outcome.ok ? resolve(outcome.value) : reject(outcome.error)

    if (request.capturedOutcome) {
      request.responderAbort.abort()
      deliver(request.capturedOutcome)
      return
    }
    if (!options.hadResponder) {
      reject(new MessageBusError('NO_RESPONDER'))
      return
    }

    const timeoutMs = options.timeout === undefined ? DEFAULT_TIMEOUT_MS : options.timeout
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => settle(request, {ok: false, error: new MessageBusError('ABORTED')})

    request.deliver = (outcome) => {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      request.responderAbort.abort()
      deliver(outcome)
    }

    if (timeoutMs !== null) {
      timer = setTimeout(
        () => settle(request, {ok: false, error: new MessageBusError('TIMEOUT')}),
        timeoutMs,
      )
    }
    if (options.signal) {
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, {once: true})
    }
  })
}

function emitEvent(
  registry: MessageBusRegistry,
  type: string,
  payload: unknown,
  options: MessageBusEmitOptions | undefined,
  appId: string,
): MessageBusEmitResult<unknown> {
  const hadResponder = (registry.responderCounts.get(type) ?? 0) > 0
  const responderAbort = new AbortController()
  const request: PendingRequest = {
    responderAbort,
    responderSignal: scopeSignal(options?.signal, responderAbort.signal),
    settled: false,
  }

  resolveEventSubject(registry, type).next(createMessage(appId, type, payload, request))

  const awaitReply = () =>
    (request.replyPromise ??= createReplyPromise(request, {
      ...options,
      hadResponder,
    }))
  return {
    // oxlint-disable-next-line unicorn/no-thenable -- intentional PromiseLike: awaiting it arms the failure machinery; not awaiting is fire-and-forget.
    then: (onFulfilled, onRejected) => awaitReply().then(onFulfilled, onRejected),
    catch: (onRejected) => awaitReply().then(undefined, onRejected),
    finally: (onFinally) => awaitReply().finally(onFinally),
  }
}

const isStateTopic = (registry: MessageBusRegistry, type: string): boolean =>
  registry.topics.get(type)?.kind === 'state'

const isOwner = (
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
    if (!isOwner(registry, topic.ownership, appId)) {
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
    void source.firstValue.then((value) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(value)
    })
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
  message: MessageBusMessage<unknown, unknown> & {[MESSAGE_BUS_REQUEST_KEY]?: PendingRequest},
): void {
  const request = message[MESSAGE_BUS_REQUEST_KEY]
  const fail = (error: unknown) => {
    if (request) {
      settle(request, {
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
  if (topic && !isOwner(registry, topic.ownership, appId)) {
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

  registerTopics(registry, DASHBOARD_TOPIC_MANIFEST)

  const api = {
    emit: (type: string, payload: unknown, options?: MessageBusEmitOptions) =>
      emit(registry, type, payload, options, registry.appId),
    query: (type: string, options?: MessageBusAbortOptions) => query(registry, type, options),
    subscribe: (type: string, handler?: (arg: never) => void, options?: MessageBusAbortOptions) =>
      subscribe(registry, type, handler, options, registry.appId),
  }

  const instance = api as unknown as InternalMessageBus
  instance[MESSAGE_BUS_REGISTRY_KEY] = registry
  instance[MESSAGE_BUS_PROTOCOL_KEY] = LEGACY_MESSAGE_BUS_PROTOCOL
  return instance
}

function topicVersions(
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

function topicAdapters(
  installedMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
  applicationMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
): {
  toInstalled: (type: string, value: unknown) => unknown
  toApplication: (type: string, value: unknown) => unknown
} {
  const installedVersions = topicVersions(installedMigrations)
  const applicationVersions = topicVersions(applicationMigrations)
  const applicationVersion = (type: string) => applicationVersions.get(type) ?? 1
  const installedVersion = (type: string) => installedVersions.get(type) ?? 1
  const chainFor = (type: string) =>
    (applicationVersion(type) > installedVersion(type)
      ? applicationMigrations
      : installedMigrations
    ).get(type)
  return {
    toInstalled: (type, value) =>
      applyChain(chainFor(type), value, applicationVersion(type), installedVersion(type)),
    toApplication: (type, value) =>
      applyChain(chainFor(type), value, installedVersion(type), applicationVersion(type)),
  }
}

function applyChain(
  steps: readonly TopicMigration[] | undefined,
  value: unknown,
  from: number,
  to: number,
): unknown {
  if (!steps || steps.length === 0 || from === to) return value

  let current = value
  if (from < to) {
    for (let version = from; version < to; version++) {
      const step = steps.find((candidate) => candidate.from === version)
      if (step) current = step.up(current)
    }
  } else {
    for (let version = from; version > to; version--) {
      const step = steps.find((candidate) => candidate.from === version - 1)
      if (step) current = step.down(current)
    }
  }
  return current
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

function adaptMessage(
  message: MessageBusMessage<unknown, unknown>,
  downPayload: (value: unknown) => unknown,
): MessageBusMessage<unknown, unknown> {
  // Request replies are versioned independently from event payloads.
  return {
    type: message.type,
    payload: downPayload(message.payload),
    meta: message.meta,
    reply: message.reply,
    get signal() {
      return message.signal
    },
  }
}

function createFailedMessageBus(fail: () => never): MessageBus {
  return {
    emit: fail,
    query: fail,
    subscribe: fail,
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
  const registry = (installedMessageBus as Partial<InternalMessageBus>)[MESSAGE_BUS_REGISTRY_KEY]
  if (!registry) {
    console.error(`[sanity-sdk:message-bus] incompatible message bus for "${appId}"`)
    return createFailedMessageBus(() => {
      throw new MessageBusError(
        'PROTOCOL_MISMATCH',
        'installed message bus does not expose a compatible registry',
      )
    })
  }

  const applicationMigrations = config.migrations ?? bundledMigrations()

  try {
    registerTopics(registry, DASHBOARD_TOPIC_MANIFEST)
  } catch (error) {
    console.error(`[sanity-sdk:message-bus] topic manifest conflict for "${appId}"`, {error})
    return createFailedMessageBus(() => {
      throw error
    })
  }
  const {toInstalled, toApplication} = topicAdapters(registry.migrations, applicationMigrations)
  const isState = (type: string) => isStateTopic(registry, type)

  // Reuse topic streams because React external-store snapshots require stable references.
  const applicationStreams = new Map<string, MessageBusStateSource<unknown> | Observable<unknown>>()
  let streamGeneration = registry.generation

  const api = {
    emit: (type: string, payload: unknown, options?: MessageBusEmitOptions) =>
      emit(registry, type, toInstalled(type, payload), options, appId),
    query: (type: string, options?: MessageBusAbortOptions) =>
      query(registry, type, options).then((value) => toApplication(type, value)),
    subscribe: (type: string, handler?: (arg: never) => void, options?: MessageBusAbortOptions) => {
      if (!handler) {
        if (streamGeneration !== registry.generation) {
          applicationStreams.clear()
          streamGeneration = registry.generation
        }
        let stream = applicationStreams.get(type)
        if (!stream) {
          const raw = subscribe(registry, type, undefined, options, appId)
          stream = isState(type)
            ? mapStateSource(raw as MessageBusStateSource<unknown>, (value) =>
                toApplication(type, value),
              )
            : (raw as Observable<unknown>).pipe(map((payload) => toApplication(type, payload)))
          applicationStreams.set(type, stream)
        }
        return stream
      }
      const adapted = isState(type)
        ? (value: unknown) => (handler as (value: unknown) => void)(toApplication(type, value))
        : (message: MessageBusMessage<unknown, unknown>) =>
            (handler as (message: MessageBusMessage<unknown, unknown>) => void)(
              adaptMessage(message, (value) => toApplication(type, value)),
            )
      return subscribe(registry, type, adapted as (arg: never) => void, options, appId)
    },
  }

  const instance = api as unknown as InternalMessageBus
  instance[MESSAGE_BUS_REGISTRY_KEY] = registry
  instance[MESSAGE_BUS_PROTOCOL_KEY] = LEGACY_MESSAGE_BUS_PROTOCOL
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
  registerTopics(registry, DASHBOARD_TOPIC_MANIFEST)
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
 * Returns whether a compatible message bus is installed.
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
 * Connects this application to the installed message bus, or returns `undefined` when absent.
 * @public
 */
export function connectMessageBus(options: ConnectMessageBusOptions = {}): MessageBus | undefined {
  const installedMessageBus = getInstalledMessageBus()
  if (!installedMessageBus) return undefined

  const appId = resolveAppId(options.appId)
  return appId
    ? connectApplicationToMessageBus(installedMessageBus, {appId})
    : createFailedMessageBus(throwMissingAppId)
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
    console.warn('[sanity-sdk:message-bus] replaced a foreign value at the message bus install key')
  }
  globals[MESSAGE_BUS_KEY] = createIsolatedMessageBus(appId)
  return connectApplicationToMessageBus(globals[MESSAGE_BUS_KEY], {appId})
}

/**
 * Registers state topics on an isolated message bus.
 * @internal
 */
export function registerStateTopics(
  target: MessageBus,
  topics: Partial<{[K in StateTopic]: ValueOf<K> | undefined}>,
): void {
  const registry = (target as InternalMessageBus)[MESSAGE_BUS_REGISTRY_KEY]
  const manifest: TopicManifest = Object.fromEntries(
    Object.entries(topics).map(([name, seed]) => [
      name,
      {kind: 'state', ownership: {type: 'any_app'}, seed},
    ]),
  )
  registerTopics(registry, manifest, {reseed: true})
}

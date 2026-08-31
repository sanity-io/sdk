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

import {MessageBusError} from './errors'
import {createMeta, type OsMessage} from './message'
import {
  type EventTopic,
  type PayloadOf,
  type ReplyOf,
  type StateTopic,
  type TopicManifest,
  type TopicMigration,
  topicMigrations,
  type TopicName,
  type ValueOf,
  WORKBENCH_TOPIC_MANIFEST,
} from './topics'

/**
 * A state topic's read shape. Piping it drops `getCurrent` and `firstValue` (the
 * result is a plain `Observable`) — read them off the un-piped source.
 * @public
 */
export interface StateSource<T> extends Observable<T> {
  getCurrent(): T | undefined
  firstValue: Promise<T>
}

/**
 * The one teardown idiom: abort the `signal` to cancel a `query` or tear down a
 * `subscribe`. One controller scopes any number of them.
 * @public
 */
export interface AbortOptions {
  signal?: AbortSignal
}

/**
 * `emit` options. `timeout` (default 5s; `null` disables the deadline so the
 * `signal` governs) composes with the `signal` — whichever fires first rejects.
 * @public
 */
export interface EmitOptions extends AbortOptions {
  timeout?: number | null
}

/**
 * An event `emit`'s result. Awaiting it arms the failure machinery; not awaiting
 * is pure fire-and-forget.
 * @public
 */
export interface EmitResult<R> extends PromiseLike<R> {
  catch<T = never>(onRejected?: (reason: unknown) => T | PromiseLike<T>): Promise<R | T>
  finally(onFinally?: () => void): Promise<R>
}

/**
 * The in-process message bus. State topics hold a current value (`query` /
 * `subscribe`); event topics stream occurrences, and a request topic (one that
 * declares a reply) resolves an awaited `emit` with that reply.
 * @public
 */
export interface Bus {
  /** Reset all mutable bus state. Intended for test isolation. */
  reset(): void
  /** Publish a state topic's current value (fire-and-forget). */
  emit<K extends StateTopic>(type: K, value: ValueOf<K>): void
  /**
   * Fire an event, or `await` it for a request topic's reply. A topic whose
   * payload is `void` takes no payload argument.
   */
  emit<K extends EventTopic>(
    type: K,
    ...rest: PayloadOf<K> extends void
      ? [payload?: void, options?: EmitOptions]
      : [payload: PayloadOf<K>, options?: EmitOptions]
  ): EmitResult<ReplyOf<K>>
  /**
   * Read a state topic's value once. Seeded topics resolve at once; a suspending
   * one waits for its first value, bounded by the deadline and `signal` (rejects
   * `TIMEOUT`/`ABORTED`).
   */
  query<K extends StateTopic>(type: K, options?: AbortOptions): Promise<ValueOf<K>>
  /**
   * Run `handler` for each event (it may `reply`). Tear down by aborting
   * `options.signal`; with none, it lives for the app's lifetime.
   */
  subscribe<K extends EventTopic>(
    type: K,
    handler: (message: OsMessage<PayloadOf<K>, ReplyOf<K>>) => void,
    options?: AbortOptions,
  ): void
  /** React to a state topic's value; tears down when `options.signal` aborts. */
  subscribe<K extends StateTopic>(
    type: K,
    handler: (value: ValueOf<K>) => void,
    options?: AbortOptions,
  ): void
  /** Compose a state topic as a `StateSource` (Observable + synchronous read). */
  subscribe<K extends StateTopic>(type: K): StateSource<ValueOf<K>>
  /** Compose an event topic as an `Observable` of its payloads. */
  subscribe<K extends EventTopic>(type: K): Observable<PayloadOf<K>>
}

// Registered symbols, so every federated copy resolves the same keys. BUS holds
// the shared core (a named global would collide). PROTOCOL is the one eternal
// key: the layout behind REGISTRY may change with the protocol number, but
// PROTOCOL must stay readable by every copy ever shipped.
const BUS = Symbol.for('sanity.os.bus')
const PROTOCOL = Symbol.for('sanity.os.protocol')
const REGISTRY = Symbol.for('sanity.os.registry')
const REQUEST = Symbol.for('sanity.os.request')

// The structural contract between copies. Bumping it is a breaking event,
// expected never — the check exists to fail loudly instead of corrupting.
const OS_PROTOCOL = 1

const DEFAULT_TIMEOUT_MS = 5000

// What a suspending topic holds until its first value; never exposed to readers.
const NO_VALUE = Symbol.for('sanity.os.no-value')

type Outcome =
  | {readonly ok: true; readonly value: unknown}
  | {readonly ok: false; readonly error: unknown}

// One in-flight request, carried in the emit closure and on the message — no
// registry map to leak. No Promise exists until the first await, so a
// fire-and-forget emit can't raise an unhandled rejection.
interface PendingRequest {
  readonly responderAbort: AbortController
  readonly responderSignal: AbortSignal
  settled: boolean
  capturedOutcome?: Outcome
  deliver?: (outcome: Outcome) => void
  replyPromise?: Promise<unknown>
}

interface Registry {
  readonly appId: string
  readonly topics: Map<string, TopicManifest[string]>
  readonly stateSubjects: Map<string, BehaviorSubject<unknown>>
  readonly stateSources: Map<string, StateSource<unknown>>
  readonly eventSubjects: Map<string, Subject<OsMessage<unknown, unknown>>>
  readonly responderCounts: Map<string, number>
  // One controller per app id — disconnectApp tears an app's footprint down
  // in one abort.
  readonly appAborts: Map<string, AbortController>
  readonly migrations: ReadonlyMap<string, readonly TopicMigration[]>
  resetAbort: AbortController
  generation: number
}

type InternalBus = Bus & {[REGISTRY]: Registry; [PROTOCOL]: number}

function resolveStateSubject(registry: Registry, type: string): BehaviorSubject<unknown> {
  let subject = registry.stateSubjects.get(type)
  if (!subject) {
    // Read before declared: hold the sentinel so the read waits instead of
    // resolving a misleading `undefined`.
    console.warn(
      `[sanity-sdk:message-bus] state topic "${type}" read before any value was published`,
    )
    subject = new BehaviorSubject<unknown>(NO_VALUE)
    registry.stateSubjects.set(type, subject)
  }
  return subject
}

// The one constructor for a state topic's read shape. Its contract carries two
// load-bearing invariants: `getCurrent` reports `undefined` until the first
// value (a Suspense binding waits on it), and stays reference-stable per
// underlying value (`useSyncExternalStore` spins otherwise).
function toStateSource(
  values: Observable<unknown>,
  getCurrent: () => unknown,
): StateSource<unknown> {
  const source = values as StateSource<unknown>
  source.getCurrent = getCurrent
  source.firstValue = firstValueFrom(values)
  return source
}

function resolveStateSource(registry: Registry, type: string): StateSource<unknown> {
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

// Validate the full manifest before registering it to avoid partial updates.
// fallow-ignore-next-line complexity -- Kept aligned with Workbench's registry compatibility logic.
function registerTopics(
  registry: Registry,
  manifest: TopicManifest,
  {reseed = false}: {reseed?: boolean} = {},
): void {
  for (const [type, entry] of Object.entries(manifest)) {
    const existing = registry.topics.get(type)
    if (existing && existing.kind !== entry.kind) {
      throw new MessageBusError(
        'PROTOCOL_MISMATCH',
        `topic "${type}" is declared "${entry.kind}" but the installed bus knows it as "${existing.kind}"`,
      )
    }
    const ownership = existing?.ownership
    if (ownership && ownership.type !== entry.ownership.type) {
      throw new MessageBusError('OWNERSHIP_MISMATCH', `topic "${type}" has conflicting ownership`)
    }
  }
  for (const [type, entry] of Object.entries(manifest)) {
    registry.topics.set(type, entry)
    if (entry.kind === 'state') {
      const subject = registry.stateSubjects.get(type)
      if (!subject) {
        registry.stateSubjects.set(
          type,
          new BehaviorSubject<unknown>(entry.seed === undefined ? NO_VALUE : entry.seed),
        )
      } else if (reseed && entry.seed !== undefined && !Object.is(subject.getValue(), entry.seed)) {
        subject.next(entry.seed)
      }
    }
  }
}

function resolveEventSubject(
  registry: Registry,
  type: string,
): Subject<OsMessage<unknown, unknown>> {
  let subject = registry.eventSubjects.get(type)
  if (!subject) {
    subject = new Subject<OsMessage<unknown, unknown>>()
    registry.eventSubjects.set(type, subject)
  }
  return subject
}

/** Settle a request once, from whichever side fires first (reply/throw/timeout/abort). */
function settle(request: PendingRequest, outcome: Outcome): void {
  if (request.settled) return
  request.settled = true
  if (request.deliver) request.deliver(outcome)
  else request.capturedOutcome = outcome // caller hasn't awaited yet — stash it
}

function createMessage(
  appId: string,
  type: string,
  payload: unknown,
  request: PendingRequest,
): OsMessage<unknown, unknown> {
  const message: OsMessage<unknown, unknown> & {[REQUEST]?: PendingRequest} = {
    type: type as TopicName,
    payload,
    meta: createMeta(appId),
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

  // The reply routes through the request riding the message — no registry lookup.
  message[REQUEST] = request
  return message
}

function createReplyPromise(
  request: PendingRequest,
  options: EmitOptions & {hadResponder: boolean},
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const deliver = (outcome: Outcome) =>
      outcome.ok ? resolve(outcome.value) : reject(outcome.error)

    // A same-tick reply already settled this.
    if (request.capturedOutcome) {
      request.responderAbort.abort()
      deliver(request.capturedOutcome)
      return
    }
    // NO_RESPONDER is judged at send time: nothing was listening then.
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
      request.responderAbort.abort() // caller is done waiting — let the responder bail
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
  registry: Registry,
  type: string,
  payload: unknown,
  options: EmitOptions | undefined,
  appId: string,
): EmitResult<unknown> {
  const hadResponder = (registry.responderCounts.get(type) ?? 0) > 0
  const responderAbort = new AbortController()
  const request: PendingRequest = {
    responderAbort,
    responderSignal: scopeSignal(options?.signal, responderAbort.signal),
    settled: false,
  }

  resolveEventSubject(registry, type).next(createMessage(appId, type, payload, request))

  // Failure machinery arms on the first await (see PendingRequest).
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

const isStateTopic = (registry: Registry, type: string): boolean =>
  registry.topics.get(type)?.kind === 'state'

const isOwner = (
  registry: Registry,
  ownership: TopicManifest[string]['ownership'],
  appId: string,
): boolean => ownership.type === 'any_app' || appId === registry.appId

function emit(
  registry: Registry,
  type: string,
  payload: unknown,
  options: EmitOptions | undefined,
  appId: string,
): EmitResult<unknown> | undefined {
  const topic = registry.topics.get(type)
  if (topic?.kind === 'state') {
    if (!isOwner(registry, topic.ownership, appId)) {
      throw new MessageBusError(
        'OWNERSHIP_MISMATCH',
        `Cannot emit state topic "${type}" from app "${appId}". Only the app that owns this topic can publish it. Other apps can read it with query() or subscribe().`,
      )
    }
    const subject = resolveStateSubject(registry, type)
    // Producers may republish freely (e.g. on every machine state entry);
    // subscribers only ever see actual changes.
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
  registry: Registry,
  type: string,
  options: AbortOptions | undefined,
): Promise<unknown> {
  const source = resolveStateSource(registry, type)
  const current = source.getCurrent()
  if (current !== undefined) return Promise.resolve(current)

  const signal = scopeSignal(options?.signal, registry.resetAbort.signal)
  if (signal?.aborted) return Promise.reject(new MessageBusError('ABORTED'))
  // The deadline keeps a never-producing topic from hanging the caller.
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
  handler: (message: OsMessage<unknown, unknown>) => unknown,
  message: OsMessage<unknown, unknown> & {[REQUEST]?: PendingRequest},
): void {
  const request = message[REQUEST]
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
    // An async responder that rejects surfaces as HANDLER_THREW to the caller.
    if (result instanceof Promise) result.catch(fail)
  } catch (error) {
    fail(error)
  }
}

function subscribe(
  registry: Registry,
  type: string,
  handler: ((arg: never) => void) | undefined,
  options: AbortOptions | undefined,
  appId: string,
): StateSource<unknown> | Observable<unknown> | void {
  const isState = isStateTopic(registry, type)

  if (!handler) {
    return isState
      ? resolveStateSource(registry, type)
      : resolveEventSubject(registry, type).pipe(map((message) => message.payload))
  }

  // Handler form returns nothing — teardown is via `options.signal`, the one
  // idiom shared with `query`.
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

  // Event handler = responder: counts toward NO_RESPONDER and may `reply`.
  registry.responderCounts.set(type, (registry.responderCounts.get(type) ?? 0) + 1)
  const subscription = resolveEventSubject(registry, type).subscribe((message) =>
    invokeResponder(handler as (message: OsMessage<unknown, unknown>) => unknown, message),
  )
  subscription.add(() => {
    const count = registry.responderCounts.get(type) ?? 0
    if (count > 0) registry.responderCounts.set(type, count - 1)
  })
  unsubscribeOnAbort(subscription, scopeSignal(options?.signal, registry.resetAbort.signal))
}

// This copy's per-topic chains, pinning its versions when a caller supplies none.
const bundledMigrations = () => new Map(Object.entries(topicMigrations))

/**
 * Build an isolated bus with no `globalThis` install — the test seam.
 * `migrations` lets a test stand up synthetic topic chains; production passes
 * nothing.
 */
export function createBus(
  appId: string,
  config: {
    migrations?: ReadonlyMap<string, readonly TopicMigration[]>
  } = {},
): Bus {
  if (!appId) throwMissingAppId()

  const registry: Registry = {
    appId,
    topics: new Map(),
    stateSubjects: new Map(),
    stateSources: new Map(),
    eventSubjects: new Map(),
    responderCounts: new Map(),
    appAborts: new Map(),
    migrations: config.migrations ?? bundledMigrations(),
    resetAbort: new AbortController(),
    generation: 0,
  }

  registerTopics(registry, WORKBENCH_TOPIC_MANIFEST)

  const api = {
    reset: () => reset(registry),
    emit: (type: string, payload: unknown, options?: EmitOptions) =>
      emit(registry, type, payload, options, registry.appId),
    query: (type: string, options?: AbortOptions) => query(registry, type, options),
    subscribe: (type: string, handler?: (arg: never) => void, options?: AbortOptions) =>
      subscribe(registry, type, handler, options, registry.appId),
  }

  const instance = api as unknown as InternalBus
  instance[REGISTRY] = registry
  instance[PROTOCOL] = OS_PROTOCOL
  return instance
}

// A topic's version is the highest `to` its chain reaches — derived, never
// hand-declared.
export function topicVersions(
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

// Recast values between a client's topic versions and the installed core's.
// Chains are append-only shared history, so the deeper side carries every step
// between the two versions: a client behind the install walks the core's chain,
// one ahead walks its own.
export function topicAdapters(
  coreMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
  clientMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
): {
  toCore: (type: string, value: unknown) => unknown
  toClient: (type: string, value: unknown) => unknown
} {
  const coreVersions = topicVersions(coreMigrations)
  const clientVersions = topicVersions(clientMigrations)
  const clientVersion = (type: string) => clientVersions.get(type) ?? 1
  const coreVersion = (type: string) => coreVersions.get(type) ?? 1
  const chainFor = (type: string) =>
    (clientVersion(type) > coreVersion(type) ? clientMigrations : coreMigrations).get(type)
  return {
    toCore: (type, value) =>
      applyChain(chainFor(type), value, clientVersion(type), coreVersion(type)),
    toClient: (type, value) =>
      applyChain(chainFor(type), value, coreVersion(type), clientVersion(type)),
  }
}

// A version the topic didn't change at has no step and is skipped, so a chain
// only declares the versions that actually moved.
export function applyChain(
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

// `project` builds a fresh object per call, so the result is cached by input
// reference — that's what keeps a projected `getCurrent` stable (see
// `toStateSource`).
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
  source: StateSource<unknown>,
  project: (value: unknown) => unknown,
): StateSource<unknown> {
  return toStateSource(source.pipe(map(project)), projectCurrent(source.getCurrent, project))
}

function adaptMessage(
  message: OsMessage<unknown, unknown>,
  downPayload: (value: unknown) => unknown,
): OsMessage<unknown, unknown> {
  // The reply passes back untouched — replies aren't migrated.
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

function createInertBus(fail: () => never): Bus {
  return {
    emit: fail,
    query: fail,
    reset: fail,
    subscribe: fail,
  } as unknown as Bus
}

function resolveAppAbort(registry: Registry, appId: string): AbortController {
  let controller = registry.appAborts.get(appId)
  if (!controller) {
    controller = new AbortController()
    registry.appAborts.set(appId, controller)
  }
  return controller
}

/**
 * Tear down everything an app holds on the bus in one abort. The next `connect`
 * for the same app id starts a fresh lifetime, so a reload replaces a
 * generation of handlers instead of stacking a new one.
 * @public
 */
export function disconnectApp(bus: Bus, appId: string): void {
  const registry = (bus as InternalBus)[REGISTRY]
  const controller = registry.appAborts.get(appId)
  if (!controller) return
  registry.appAborts.delete(appId)
  controller.abort()
}

/**
 * Options for {@link connect}. `appId` is stamped on every message the client
 * emits and scopes its lifetime (see {@link disconnectApp}); `migrations` pins
 * the client's per-topic versions and defaults to this copy's bundled chains.
 * @public
 */
export interface ConnectOptions {
  appId: string
  migrations?: ReadonlyMap<string, readonly TopicMigration[]>
}

/**
 * Connect a client to the shared core: this copy's identity plus its topic
 * versions, recast per topic against the install in either direction (see
 * {@link topicAdapters}).
 *
 * A core-protocol mismatch yields an inert client whose first use reports the
 * mismatch.
 * @public
 */
export function connect(core: Bus, config: ConnectOptions): Bus {
  if (!config?.appId) throwMissingAppId()

  const {appId} = config
  const installedProtocol = (core as Partial<InternalBus>)[PROTOCOL]
  if (installedProtocol !== OS_PROTOCOL) {
    console.error(
      `[sanity-sdk:message-bus] OS bus protocol mismatch for "${appId}": installed ${String(installedProtocol)}, this copy speaks ${OS_PROTOCOL}`,
    )
    return createInertBus(() => {
      throw new MessageBusError(
        'PROTOCOL_MISMATCH',
        `installed OS bus speaks protocol ${String(installedProtocol)}, this copy speaks ${OS_PROTOCOL}`,
      )
    })
  }

  const clientMigrations = config.migrations ?? bundledMigrations()
  const registry = (core as InternalBus)[REGISTRY]

  try {
    registerTopics(registry, WORKBENCH_TOPIC_MANIFEST)
  } catch (error) {
    console.error(`[sanity-sdk:message-bus] OS bus topic manifest conflict for "${appId}"`, {
      error,
    })
    return createInertBus(() => {
      throw error
    })
  }
  const {toCore, toClient} = topicAdapters(registry.migrations, clientMigrations)
  const isState = (type: string) => isStateTopic(registry, type)

  // Everything the client subscribes to or waits on is scoped to its app's
  // lifetime, composed with any caller signal.
  const scoped = (signal: AbortSignal | undefined) =>
    scopeSignal(signal, resolveAppAbort(registry, appId).signal)

  // One stream per topic: a UI binding may call `subscribe` on every render,
  // and a fresh stream each call spins `useSyncExternalStore`.
  const clientStreams = new Map<string, StateSource<unknown> | Observable<unknown>>()
  let streamGeneration = registry.generation

  const api = {
    reset: () => reset(registry),
    emit: (type: string, payload: unknown, options?: EmitOptions) =>
      emit(
        registry,
        type,
        toCore(type, payload),
        {...options, signal: scoped(options?.signal)},
        appId,
      ),
    query: (type: string, options?: AbortOptions) =>
      query(registry, type, {signal: scoped(options?.signal)}).then((value) =>
        toClient(type, value),
      ),
    subscribe: (type: string, handler?: (arg: never) => void, options?: AbortOptions) => {
      if (!handler) {
        if (streamGeneration !== registry.generation) {
          clientStreams.clear()
          streamGeneration = registry.generation
        }
        let stream = clientStreams.get(type)
        if (!stream) {
          const raw = subscribe(registry, type, undefined, options, appId)
          stream = isState(type)
            ? mapStateSource(raw as StateSource<unknown>, (value) => toClient(type, value))
            : (raw as Observable<unknown>).pipe(map((payload) => toClient(type, payload)))
          clientStreams.set(type, stream)
        }
        return stream
      }
      const adapted = isState(type)
        ? (value: unknown) => (handler as (value: unknown) => void)(toClient(type, value))
        : (message: OsMessage<unknown, unknown>) =>
            (handler as (message: OsMessage<unknown, unknown>) => void)(
              adaptMessage(message, (value) => toClient(type, value)),
            )
      return subscribe(
        registry,
        type,
        adapted as (arg: never) => void,
        {
          signal: scoped(options?.signal),
        },
        appId,
      )
    },
  }

  const instance = api as unknown as InternalBus
  // Carrying the symbols lets internal seams reach the shared registry and a
  // client itself be `connect`ed.
  instance[REGISTRY] = registry
  instance[PROTOCOL] = OS_PROTOCOL
  return instance
}

function reset(registry: Registry): void {
  registry.resetAbort.abort()
  for (const controller of registry.appAborts.values()) controller.abort()
  for (const subject of registry.stateSubjects.values()) subject.complete()
  for (const subject of registry.eventSubjects.values()) subject.complete()

  registry.topics.clear()
  registry.stateSubjects.clear()
  registry.stateSources.clear()
  registry.eventSubjects.clear()
  registry.responderCounts.clear()
  registry.appAborts.clear()
  registry.resetAbort = new AbortController()
  registry.generation += 1
  registerTopics(registry, WORKBENCH_TOPIC_MANIFEST)
}

declare const __SANITY_APP_ID__: string | undefined

function throwMissingAppId(): never {
  throw new MessageBusError(
    'MISSING_APP_ID',
    'Cannot initialize the OS bus without an app ID. Build the application with the Sanity CLI or pass an app ID when creating the bus.',
  )
}

function resolveAppId(appId?: string): string {
  const resolved = appId ?? (typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : undefined)
  if (resolved) return resolved
  return throwMissingAppId()
}

function installedBus(): Bus | undefined {
  const bus = (globalThis as {[BUS]?: unknown})[BUS]
  return typeof bus === 'object' && bus !== null && PROTOCOL in bus
    ? (bus as unknown as Bus)
    : undefined
}

/**
 * Options for creating a message bus. The app ID defaults to the identity
 * embedded by the Sanity CLI.
 * @public
 */
export interface CreateMessageBusOptions {
  appId?: string
}

/**
 * Connect this application to Workbench's message bus, or return `undefined`
 * when Workbench has not installed one.
 * @public
 */
export function createMessageBus(
  options: CreateMessageBusOptions & {optional: true},
): Bus | undefined
/**
 * Connect this application to the message bus installed by Workbench.
 * @public
 */
export function createMessageBus(options?: CreateMessageBusOptions & {optional?: false}): Bus
export function createMessageBus(
  options: CreateMessageBusOptions & {optional?: boolean} = {},
): Bus | undefined {
  const core = installedBus()
  if (!core) {
    if (options.optional) return undefined
    throw new MessageBusError(
      'BUS_NOT_INSTALLED',
      'Cannot create a message bus because Workbench has not installed one.',
    )
  }
  return connect(core, {appId: resolveAppId(options.appId)})
}

/** @internal */
export function installMessageBus(options: CreateMessageBusOptions = {}): Bus {
  const appId = resolveAppId(options.appId)
  const core = installedBus()
  if (core) return connect(core, {appId})

  const globals = globalThis as {[BUS]?: Bus}
  if (globals[BUS]) {
    console.warn('[sanity-sdk:message-bus] replaced a foreign value at the OS bus install key')
  }
  globals[BUS] = createBus(appId)
  return connect(globals[BUS], {appId})
}

/**
 * Registers state topics an app adds to `Topics`; `undefined` makes reads wait
 * for the first publish, and a name already used as an event topic throws.
 * @public
 */
export function defineStateTopics(
  target: Bus,
  topics: Partial<{[K in StateTopic]: ValueOf<K> | undefined}>,
): void {
  const registry = (target as InternalBus)[REGISTRY]
  const manifest: TopicManifest = Object.fromEntries(
    Object.entries(topics).map(([name, seed]) => [
      name,
      {kind: 'state', ownership: {type: 'any_app'}, seed},
    ]),
  )
  registerTopics(registry, manifest, {reseed: true})
}

import {use, useMemo} from 'react'
import {useObservable} from 'react-rx'
import {
  defer,
  finalize,
  firstValueFrom,
  map,
  type Observable,
  ReplaySubject,
  share,
  timer,
} from 'rxjs'

import {type MessageBus, type MessageBusStateSource} from '../../dashboard/messageBus/bus'
import {getDashboardMessageBus} from '../../dashboard/messageBus/client'
import {
  type EventTopic,
  type PayloadOf,
  type StateTopic,
  type TopicName,
  type TopicResult,
  type ValueOf,
} from '../../dashboard/messageBus/topics'

/**
 * An error raised when a dashboard state topic reports failure.
 * @public
 */
export class TopicError extends Error {
  /** Identifies a failed topic read. */
  readonly code = 'TOPIC_FAILED'

  /** The topic that failed. */
  readonly topic: TopicName

  /** Creates an error for a failed topic. */
  constructor(topic: TopicName) {
    super(`Topic "${topic}" failed`)
    this.name = 'TopicError'
    this.topic = topic
  }
}

type ReadyTopicResult<T> = {data: T; error?: never; isPending: false}
type PendingTopicResult = {data: undefined; error?: never; isPending: true}
type FailedTopicResult<TError> = {data?: never; error: TError; isPending: false}

/**
 * The current data, pending state, or error for a dashboard topic.
 * @public
 */
export type UseTopicResult<
  T,
  Suspend extends boolean = boolean,
  TError = never,
> = Suspend extends true
  ? ReadyTopicResult<T>
  :
      | ReadyTopicResult<T>
      | PendingTopicResult
      | ([TError] extends [never] ? never : FailedTopicResult<TError>)

/**
 * Controls whether {@link useTopic} suspends pending reads and throws failed reads.
 * @public
 */
export type UseTopicOptions<Suspend extends boolean = boolean> = {suspend?: Suspend}

const pendingTopicResult = {data: undefined, isPending: true} as const

const readyTopicResult = <T>(data: T) => ({data, isPending: false}) as const

const failedTopicResult = (topic: TopicName) =>
  ({
    error: new TopicError(topic),
    isPending: false,
  }) as const

type WireTopicData<K extends TopicName> = K extends StateTopic
  ? ValueOf<K>
  : K extends EventTopic
    ? PayloadOf<K>
    : never

type UnwrapTopicResult<T> = T extends {ok: true; value: infer Value}
  ? Value
  : T extends {ok: false}
    ? never
    : T

type TopicData<K extends TopicName> = K extends StateTopic
  ? UnwrapTopicResult<ValueOf<K>>
  : K extends EventTopic
    ? PayloadOf<K>
    : never

type TopicErrorFor<K extends TopicName> = K extends StateTopic
  ? [Extract<ValueOf<K>, {ok: false}>] extends [never]
    ? never
    : TopicError
  : never

interface TopicSource<T> {
  readonly firstValue: Promise<T>
  readonly kind: 'event' | 'state'
  observable: Observable<T>
}

// Suspense retries discard hook state, so event sources and their first-value promises live here.
const eventSources = new WeakMap<MessageBus, Map<EventTopic, TopicSource<unknown>>>()

// State Suspense reads share query()'s timeout across render retries.
const stateFirstValues = new WeakMap<MessageBusStateSource<unknown>, Promise<unknown>>()

function subscribeToTopic<K extends TopicName>(
  messageBus: MessageBus,
  topic: K,
): Observable<WireTopicData<K>> {
  const subscribe = messageBus.subscribe as (name: TopicName) => Observable<WireTopicData<K>>
  return subscribe(topic)
}

function isTopicResult(value: unknown): value is TopicResult<unknown> {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  )
}

function toUseTopicResult<K extends TopicName>(
  topic: K,
  kind: TopicSource<WireTopicData<K>>['kind'],
  value: WireTopicData<K>,
): UseTopicResult<TopicData<K>, false, TopicError> {
  if (kind === 'state' && isTopicResult(value)) {
    return value.ok ? readyTopicResult(value.value as TopicData<K>) : failedTopicResult(topic)
  }
  return readyTopicResult(value as TopicData<K>)
}

function isStateSource<T>(source: Observable<T>): source is MessageBusStateSource<T> {
  return 'firstValue' in source
}

function getStateFirstValue(
  messageBus: MessageBus,
  topic: StateTopic,
  source: MessageBusStateSource<unknown>,
): Promise<unknown> {
  let firstValue = stateFirstValues.get(source)
  if (!firstValue) {
    firstValue = messageBus.query(topic)
    stateFirstValues.set(source, firstValue)
    void firstValue.catch(() => stateFirstValues.delete(source))
  }
  return firstValue
}

function getEventSource<K extends EventTopic>(
  messageBus: MessageBus,
  topic: K,
): TopicSource<PayloadOf<K>> {
  let sources = eventSources.get(messageBus)
  if (!sources) {
    sources = new Map()
    eventSources.set(messageBus, sources)
  }

  let eventSource = sources.get(topic)
  if (!eventSource) {
    let firstValue: Promise<PayloadOf<K>> | undefined
    const observable = defer(() => messageBus.subscribe(topic)).pipe(
      finalize(() => sources.delete(topic)),
      share({
        connector: () => new ReplaySubject<PayloadOf<K>>(1),
        // Unsubscribes after the last consumer leaves, delayed so Suspense can commit its retry.
        resetOnRefCountZero: () => timer(0),
      }),
    )
    eventSource = {
      get firstValue() {
        return (firstValue ??= firstValueFrom(observable))
      },
      kind: 'event',
      observable,
    }
    sources.set(topic, eventSource)
  }

  return eventSource as TopicSource<PayloadOf<K>>
}

function getTopicSource<K extends TopicName>(
  messageBus: MessageBus,
  topic: K,
): TopicSource<WireTopicData<K>> {
  const source = subscribeToTopic(messageBus, topic)
  if (isStateSource(source)) {
    return {
      get firstValue() {
        return getStateFirstValue(messageBus, topic as StateTopic, source) as Promise<
          WireTopicData<K>
        >
      },
      kind: 'state',
      observable: source,
    }
  }

  return getEventSource(messageBus, topic as EventTopic) as TopicSource<WireTopicData<K>>
}

/**
 * Returns the latest state value or event payload for a dashboard topic.
 *
 * The hook suspends until the first value by default. Pass `{suspend: false}` to render
 * immediately and handle pending and failed reads through the returned result. Suspended topic
 * failures propagate to the nearest error boundary. Suspended state reads use the bus query
 * deadline; event reads wait for the next payload. Event payloads are forgotten after the last
 * consumer unmounts. State topics declared with {@link TopicResult} expose their successful value
 * as `data`; result-shaped event payloads remain unchanged.
 *
 * @example
 * ```tsx
 * const {data: foregroundId} = useTopic('applications.foreground')
 *
 * const navigation = useTopic('navigation.location.update', {suspend: false})
 * if (navigation.isPending) return null
 * return navigation.data.url
 * ```
 *
 * @public
 */
export function useTopic<K extends TopicName, Suspend extends boolean = true>(
  topic: K,
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<TopicData<K>, Suspend, TopicErrorFor<K>> {
  const source = useMemo(() => {
    const messageBus = getDashboardMessageBus()
    if (!messageBus) {
      throw new Error('useTopic must be used inside a dashboard application')
    }
    return getTopicSource(messageBus, topic)
  }, [topic])

  const results = useMemo(
    () => source.observable.pipe(map((value) => toUseTopicResult(topic, source.kind, value))),
    [source, topic],
  )
  const result = useObservable(results, pendingTopicResult)
  const suspend = options.suspend !== false
  const resolved =
    result.isPending && suspend
      ? toUseTopicResult(topic, source.kind, use(source.firstValue))
      : result
  if (suspend && 'error' in resolved && resolved.error) throw resolved.error
  return resolved as UseTopicResult<TopicData<K>, Suspend, TopicErrorFor<K>>
}

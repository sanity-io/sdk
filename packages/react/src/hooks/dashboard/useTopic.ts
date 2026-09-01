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
  type ValueOf,
} from '../../dashboard/messageBus/topics'

/**
 * A dashboard topic result containing either a ready value or a pending state.
 * @public
 */
export type UseTopicResult<T, Suspend extends boolean = boolean> = Suspend extends true
  ? {data: T; isPending: false}
  : {data: T; isPending: false} | {data: undefined; isPending: true}

/**
 * Controls whether {@link useTopic} suspends until its first value.
 * @public
 */
export type UseTopicOptions<Suspend extends boolean = boolean> = {suspend?: Suspend}

const pendingTopicResult = {data: undefined, isPending: true} as const

const readyTopicResult = <T>(data: T) => ({data, isPending: false}) as const

type TopicData<K extends TopicName> = K extends StateTopic
  ? ValueOf<K>
  : K extends EventTopic
    ? PayloadOf<K>
    : never

interface TopicSource<T> {
  readonly firstValue: Promise<T>
  observable: Observable<T>
}

// Suspense retries discard hook state, so event sources and their first-value promises live here.
const eventSources = new WeakMap<MessageBus, Map<EventTopic, TopicSource<unknown>>>()

// State Suspense reads share query()'s timeout across render retries.
const stateFirstValues = new WeakMap<MessageBusStateSource<unknown>, Promise<unknown>>()

function subscribeToTopic<K extends TopicName>(
  messageBus: MessageBus,
  topic: K,
): Observable<TopicData<K>> {
  const subscribe = messageBus.subscribe as (name: TopicName) => Observable<TopicData<K>>
  return subscribe(topic)
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
      observable,
    }
    sources.set(topic, eventSource)
  }

  return eventSource as TopicSource<PayloadOf<K>>
}

function getTopicSource<K extends TopicName>(
  messageBus: MessageBus,
  topic: K,
): TopicSource<TopicData<K>> {
  const source = subscribeToTopic(messageBus, topic)
  if (isStateSource(source)) {
    return {
      get firstValue() {
        return getStateFirstValue(messageBus, topic as StateTopic, source) as Promise<TopicData<K>>
      },
      observable: source,
    }
  }

  return getEventSource(messageBus, topic as EventTopic) as TopicSource<TopicData<K>>
}

/**
 * Returns the latest state value or event payload for a dashboard topic.
 *
 * The hook suspends until the first value by default. Pass `{suspend: false}` to render
 * immediately and use `isPending` to distinguish an unpublished topic from a ready value.
 * Suspended state reads use the bus query deadline; event reads wait for the next payload.
 * Event payloads are forgotten after the last consumer unmounts.
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
): UseTopicResult<TopicData<K>, Suspend> {
  const source = useMemo(() => {
    const messageBus = getDashboardMessageBus()
    if (!messageBus) {
      throw new Error('useTopic must be used inside a dashboard application')
    }
    return getTopicSource(messageBus, topic)
  }, [topic])

  const results = useMemo(() => source.observable.pipe(map(readyTopicResult)), [source.observable])
  const result = useObservable(results, pendingTopicResult)
  return (
    result.isPending && options.suspend !== false
      ? readyTopicResult(use(source.firstValue))
      : result
  ) as UseTopicResult<TopicData<K>, Suspend>
}

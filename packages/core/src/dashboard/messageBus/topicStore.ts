import {createActionBinder} from '../../store/createActionBinder'
import {type SanityInstance} from '../../store/createSanityInstance'
import {createStateSourceAction} from '../../store/createStateSourceAction'
import {defineStore} from '../../store/defineStore'
import {setCleanupTimeout} from '../../utils/setCleanupTimeout'
import {type MessageBus, type MessageBusStateSource} from './bus'
import {requireDashboardMessageBus} from './store'
import {type StateTopic, type ValueOf} from './topics'

/**
 * An error raised when a dashboard state topic reports failure.
 * @public
 */
export class TopicError extends Error {
  /** The topic that failed. */
  readonly topic: StateTopic

  /** Creates an error for a failed topic. */
  constructor(topic: StateTopic) {
    super(`Topic "${topic}" failed`)
    this.name = 'TopicError'
    this.topic = topic
  }
}

/**
 * The value of a state topic, with `TopicResult` wrappers unwrapped to their success value.
 * @public
 */
export type TopicData<K extends StateTopic> =
  ValueOf<K> extends infer Value
    ? Value extends {ok: true; value: infer Success}
      ? Success
      : Value extends {ok: false}
        ? never
        : Value
    : never

// Mirrors the `TopicResult` shape declared in the topic manifest; no plain-value topic has an `ok` field.
function isTopicResult(value: unknown): value is {ok: boolean; value?: unknown} {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  )
}

function unwrapTopicResult(topic: StateTopic, value: unknown): unknown {
  if (!isTopicResult(value)) return value
  if (!value.ok) throw new TopicError(topic)
  return value.value
}

interface TopicEntry {
  /** Why the first-value query failed. Dropped with the entry when its last subscriber leaves. */
  error?: unknown
  /** The in-flight first-value query, shared by every suspended render of the topic. */
  pending?: Promise<void>
  subscribers: number
}

interface DashboardTopicsState {
  topics: {[topic: string]: TopicEntry}
}

// Matches the query store: a suspended component re-renders after its promise settles before
// the temporary subscriber is released, so it still sees the recorded failure.
const TOPIC_STATE_CLEAR_DELAY = 1000

const bindActionByInstance = createActionBinder<{name: string}, [topic: StateTopic]>(
  (instance) => ({name: instance.instanceId}),
)

// The bus is the source of truth for topic values (it already keeps one replaying source per
// topic). This store only tracks what the bus cannot: read failures and who is still reading.
const dashboardTopicsStore = defineStore<DashboardTopicsState>({
  name: 'dashboardTopics',
  getInitialState: () => ({topics: {}}),
})

const getMessageBus = (instance: SanityInstance, topic: StateTopic): MessageBus =>
  requireDashboardMessageBus(instance, `read topic "${topic}"`)

function getSource(instance: SanityInstance, topic: StateTopic): MessageBusStateSource<unknown> {
  return getMessageBus(instance, topic).subscribe(topic)
}

// An entry lives as long as it has subscribers. Dropping it with the last one is what gives a
// later mount a fresh deadline instead of a stale failure.
const updateEntry =
  (topic: string, update: (entry: TopicEntry) => TopicEntry) =>
  (state: DashboardTopicsState): DashboardTopicsState => {
    const {[topic]: entry = {subscribers: 0}, ...rest} = state.topics
    const next = update(entry)
    return {topics: next.subscribers > 0 ? {...rest, [topic]: next} : rest}
  }

const addSubscriber = (topic: string) =>
  updateEntry(topic, (entry) => ({...entry, subscribers: entry.subscribers + 1}))

const removeSubscriber = (topic: string) =>
  updateEntry(topic, (entry) => ({...entry, subscribers: entry.subscribers - 1}))

/**
 * A state source for a dashboard state topic, with `TopicResult` wrappers unwrapped.
 *
 * @remarks
 * Returns `undefined` until the topic publishes; use {@link resolveTopic} to wait for that
 * first value. While the topic is still unpublished, reading throws the failure that
 * {@link resolveTopic} recorded. A published value takes precedence over a recorded failure,
 * and a {@link TopicError} is thrown when the topic itself reports failure. A thrown failure
 * ends the subscription, so a reader recovers by subscribing again.
 * @internal
 */
export const getTopicState = bindActionByInstance(
  dashboardTopicsStore,
  createStateSourceAction({
    selector: ({state, instance}, topic: StateTopic) => {
      const current = getSource(instance, topic).getCurrent()
      // A recorded failure only describes the wait for a first value; a published value wins.
      const entry = state.topics[topic]
      if (current === undefined && entry?.error) throw entry.error
      return unwrapTopicResult(topic, current)
    },
    onSubscribe: ({state, instance}, topic: StateTopic) => {
      state.set('addSubscriber', addSubscriber(topic))
      // Each publish writes a fresh state object so the selector re-runs against the bus.
      const subscription = getSource(instance, topic).subscribe(() =>
        state.set(
          'publish',
          updateEntry(topic, (entry) => ({...entry})),
        ),
      )
      return () => {
        subscription.unsubscribe()
        setCleanupTimeout(
          () => state.set('removeSubscriber', removeSubscriber(topic)),
          TOPIC_STATE_CLEAR_DELAY,
        )
      }
    },
  }),
)

/**
 * Resolves once a dashboard state topic has published, or records the failure for
 * {@link getTopicState} to throw. Repeated calls for a pending topic share one query.
 *
 * @remarks
 * Holds a temporary subscriber while the query is in flight so a failure recorded after the
 * reading component has gone is dropped with it, rather than thrown at the next mount.
 * @internal
 */
export const resolveTopic = bindActionByInstance(
  dashboardTopicsStore,
  ({state, instance}, topic: StateTopic): Promise<void> => {
    const existing = state.get().topics[topic]?.pending
    if (existing) return existing

    const release = () =>
      setCleanupTimeout(
        () => state.set('removeSubscriber', removeSubscriber(topic)),
        TOPIC_STATE_CLEAR_DELAY,
      )
    const pending = getMessageBus(instance, topic)
      .query(topic)
      .then(
        () =>
          state.set(
            'resolved',
            updateEntry(topic, ({pending: _pending, ...entry}) => entry),
          ),
        (error: unknown) =>
          state.set(
            'failed',
            updateEntry(topic, ({pending: _pending, ...entry}) => ({...entry, error})),
          ),
      )
    pending.then(release, release)
    state.set(
      'query',
      updateEntry(topic, (entry) => ({...entry, pending, subscribers: entry.subscribers + 1})),
    )
    return pending
  },
)

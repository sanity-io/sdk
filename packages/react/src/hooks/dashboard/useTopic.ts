import {type SanityInstance, type StateSource} from '@sanity/sdk'
import {getDashboardMessageBus} from '@sanity/sdk/_internal'
import {
  type MessageBus,
  type MessageBusStateSource,
  type StateTopic,
  type ValueOf,
} from '@sanity/sdk/dashboard'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

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

function getMessageBus(instance: SanityInstance): MessageBus {
  const messageBus = getDashboardMessageBus(instance)
  if (!messageBus) throw new Error('useTopic must be used inside a dashboard application')
  return messageBus
}

// The bus keeps one source per topic, so caching per source keeps `subscribe` stable across renders.
const stateSources = new WeakMap<MessageBusStateSource<unknown>, StateSource<unknown>>()

// React re-renders when a thrown promise settles but does not surface its rejection, so a failed
// query is recorded here and thrown from `getCurrent` instead. The error stays until the topic
// publishes, since React may re-render a failed component before handing off to the boundary.
const failedReads = new WeakMap<MessageBusStateSource<unknown>, unknown>()

function readTopicValue(topic: StateTopic, source: MessageBusStateSource<unknown>): unknown {
  const current = source.getCurrent()
  if (current === undefined && failedReads.has(source)) throw failedReads.get(source)
  failedReads.delete(source)
  return unwrapTopicResult(topic, current)
}

function getTopicState(instance: SanityInstance, topic: StateTopic): StateSource<unknown> {
  const source = getMessageBus(instance).subscribe(topic)
  let state = stateSources.get(source)
  if (!state) {
    state = {
      subscribe: (onStoreChanged) => {
        const subscription = source.subscribe(() => onStoreChanged?.())
        return () => subscription.unsubscribe()
      },
      getCurrent: () => readTopicValue(topic, source),
      observable: source,
    }
    stateSources.set(source, state)
  }
  return state
}

function queryTopic(instance: SanityInstance, topic: StateTopic): Promise<unknown> {
  const messageBus = getMessageBus(instance)
  const source = messageBus.subscribe(topic)
  return messageBus.query(topic).catch((error: unknown) => {
    failedReads.set(source, error)
  })
}

/**
 * Returns the current value of a dashboard state topic and follows later updates.
 *
 * The hook suspends until the topic publishes its first value, using the message bus query
 * deadline. A topic declared with `TopicResult` resolves to its successful value; a
 * failed result throws a {@link TopicError} to the nearest error boundary.
 *
 * @example
 * ```tsx
 * function ForegroundApplication() {
 *   const foregroundId = useTopic('applications.foreground')
 *   return <span>{foregroundId ?? 'No application in the foreground'}</span>
 * }
 * ```
 *
 * @public
 */
export const useTopic = createStateSourceHook({
  getState: getTopicState,
  shouldSuspend: (instance, topic) => {
    const source = getMessageBus(instance).subscribe(topic)
    return !failedReads.has(source) && source.getCurrent() === undefined
  },
  suspender: queryTopic,
}) as <K extends StateTopic>(topic: K) => TopicData<K>

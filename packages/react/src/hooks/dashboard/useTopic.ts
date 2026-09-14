import {getTopicState, resolveTopic} from '@sanity/sdk/_internal'
import {type StateTopic, type TopicData} from '@sanity/sdk/dashboard'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * Returns the current value of a dashboard state topic and follows later updates.
 *
 * The hook suspends until the topic publishes its first value, using the message bus query
 * deadline. A topic declared with `TopicResult` resolves to its successful value; a
 * failed result throws a `TopicError` to the nearest error boundary.
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
  // `getCurrent` throws a recorded read failure, which surfaces it from render like a thrown value.
  shouldSuspend: (instance, topic: StateTopic) =>
    getTopicState(instance, topic).getCurrent() === undefined,
  suspender: resolveTopic,
}) as <K extends StateTopic>(topic: K) => TopicData<K>

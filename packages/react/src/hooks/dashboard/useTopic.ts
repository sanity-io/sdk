import {use, useMemo} from 'react'
import {useObservable} from 'react-rx'
import {map} from 'rxjs'

import {dashboardMessageBus, isDashboardEnvironment} from '../../dashboard/messageBus/client'
import {type StateTopic, type ValueOf} from '../../dashboard/messageBus/topics'

/**
 * A dashboard topic result that distinguishes an unpublished topic from a ready value.
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

/**
 * Returns the latest value of a dashboard state topic.
 *
 * The hook suspends until the first value by default. Pass `{suspend: false}` to render
 * immediately and use `isPending` to distinguish an unpublished topic from a ready value.
 *
 * @example
 * ```tsx
 * const {data: foregroundId} = useTopic('applications.foreground')
 *
 * const token = useTopic('auth.token', {suspend: false})
 * if (token.isPending) return <Spinner />
 * return token.data
 * ```
 *
 * @public
 */
export function useTopic<K extends StateTopic, Suspend extends boolean = true>(
  topic: K,
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<ValueOf<K>, Suspend> {
  const {source, results} = useMemo(() => {
    if (!isDashboardEnvironment(dashboardMessageBus)) {
      throw new Error('useTopic must be used inside a dashboard application')
    }
    const topicSource = dashboardMessageBus.subscribe(topic)
    return {source: topicSource, results: topicSource.pipe(map(readyTopicResult))}
  }, [topic])

  const result = useObservable(results, pendingTopicResult)
  return (
    result.isPending && options.suspend !== false
      ? readyTopicResult(use(source.firstValue))
      : result
  ) as UseTopicResult<ValueOf<K>, Suspend>
}

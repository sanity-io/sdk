import {useMemo} from 'react'
import {useObservable} from 'react-rx'

import {dashboardMessageBus, isDashboardEnvironment} from '../../dashboard/messageBus/client'
import {type StateTopic, type ValueOf} from '../../dashboard/messageBus/topics'

/**
 * Reads a dashboard state topic, returning `undefined` until its first value.
 * @public
 */
export function useTopic<K extends StateTopic>(topic: K): ValueOf<K> | undefined {
  const source = useMemo(() => {
    if (!isDashboardEnvironment(dashboardMessageBus)) {
      throw new Error('useTopic must be used inside a dashboard application')
    }
    return dashboardMessageBus.subscribe(topic)
  }, [topic])

  return useObservable(source)
}

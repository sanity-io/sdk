import {type StateTopic, type ValueOf} from '@sanity/workbench'
import {useMemo} from 'react'
import {useObservable} from 'react-rx'
import {defer, switchMap} from 'rxjs'

import {isDashboardEnvironment} from '../../context/dashboardToken'

/**
 * Reads a dashboard state topic, returning `undefined` until its first value.
 * @public
 */
export function useTopic<K extends StateTopic>(topic: K): ValueOf<K> | undefined {
  const source = useMemo(
    () =>
      defer(() => {
        if (!isDashboardEnvironment()) {
          throw new Error('useTopic must be used inside a dashboard application')
        }

        return import('@sanity/workbench')
      }).pipe(switchMap(({os}) => os.subscribe(topic))),
    [topic],
  )

  return useObservable(source)
}

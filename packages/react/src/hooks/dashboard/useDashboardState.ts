import {getIsInDashboardState, type SanityInstance, type StateSource} from '@sanity/sdk'
import {useMemo, useSyncExternalStore} from 'react'

import {getDashboardMessageBus} from '../../dashboard/messageBus/client'
import {type StateTopic, type ValueOf} from '../../dashboard/messageBus/topics'
import {useSanityInstance} from '../context/useSanityInstance'

type StateSelector<T, U> = (value: T) => U

interface SelectedStateSource<T> {
  getCurrent(): T
  subscribe(onStoreChange: () => void): () => void
}

/** Reads SDK state in embedded applications and message bus state in federated applications. @internal */
export function useDashboardState<K extends StateTopic, CoreValue, Value>(
  topic: K,
  getCoreState: (instance: SanityInstance) => StateSource<CoreValue>,
  selectCoreValue: StateSelector<CoreValue, Value>,
  selectTopicValue: StateSelector<ValueOf<K>, Value>,
): Value {
  const instance = useSanityInstance()
  const isComlinkContext = getIsInDashboardState(instance).getCurrent()
  const messageBus = isComlinkContext ? undefined : getDashboardMessageBus()

  const source = useMemo<SelectedStateSource<Value>>(() => {
    const coreState = getCoreState(instance)
    if (!messageBus) {
      return {
        getCurrent: () => selectCoreValue(coreState.getCurrent()),
        subscribe: coreState.subscribe,
      }
    }

    const topicState = messageBus.subscribe(topic)
    return {
      getCurrent: () => {
        const value = topicState.getCurrent()
        return value === undefined
          ? selectCoreValue(coreState.getCurrent())
          : selectTopicValue(value)
      },
      subscribe: (onStoreChange) => {
        const coreUnsubscribe = coreState.subscribe(onStoreChange)
        const topicSubscription = topicState.subscribe(onStoreChange)
        return () => {
          coreUnsubscribe()
          topicSubscription.unsubscribe()
        }
      },
    }
  }, [getCoreState, instance, messageBus, selectCoreValue, selectTopicValue, topic])

  return useSyncExternalStore(source.subscribe, source.getCurrent)
}

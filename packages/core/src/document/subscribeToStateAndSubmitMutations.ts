import {distinctUntilChanged, filter, from, map, mergeMap, throttleTime, withLatestFrom} from 'rxjs'

import {type ActionContext, createInternalAction} from '../resources/createAction'
import type {DocumentStoreState} from './documentStore'

const SUBMIT_THROTTLE_TIME = 100

export const subscribeToStateAndSubmitMutations = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const optimisticStore$ = state.observable.pipe(
      map((s) => s.optimisticStore),
      filter(<T>(t: T): t is NonNullable<T> => !!t),
      distinctUntilChanged(),
    )

    const submissions$ = state.observable.pipe(
      map((s) => s.mutationRefreshKey),
      filter((key) => !!key),
      distinctUntilChanged(),
      throttleTime(SUBMIT_THROTTLE_TIME, undefined, {leading: false, trailing: true}),
      withLatestFrom(optimisticStore$),
      mergeMap(([, optimisticStore]) => from(optimisticStore.submit())),
    )

    return function () {
      return submissions$.subscribe({
        error: (error) => state.set('setError', {error}),
      })
    }
  },
)

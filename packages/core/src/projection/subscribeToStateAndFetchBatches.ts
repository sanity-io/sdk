import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  pairwise,
  startWith,
  Subscription,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs'

import {getQueryState} from '../query/queryStore'
import {type StoreContext} from '../store/defineStore'
import {createProjectionQuery, processProjectionQuery} from './projectionQuery'
import {type ProjectionQueryResult, type ProjectionStoreState} from './projectionStore'
import {PROJECTION_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

export const subscribeToStateAndFetchBatches = ({
  state,
  instance,
}: StoreContext<ProjectionStoreState>): Subscription => {
  const documentProjections$ = state.observable.pipe(
    map((i) => i.documentProjections),
    distinctUntilChanged(),
  )

  const newSubscriberIds$ = state.observable.pipe(
    map(({subscriptions}) => new Set(Object.keys(subscriptions))),
    distinctUntilChanged((a, b) =>
      a.size !== b.size ? false : Array.from(a).every((i) => b.has(i)),
    ),
    debounceTime(BATCH_DEBOUNCE_TIME),
    startWith(new Set<string>()),
    pairwise(),
    tap(([prevIds, currIds]) => {
      // for all new subscriptions, set their values to pending
      const newIds = [...currIds].filter((element) => !prevIds.has(element))
      state.set('updatingPending', (prev) => {
        const pendingValues = newIds.reduce<ProjectionStoreState['values']>((acc, id) => {
          const prevValue = prev.values[id]
          const value = prevValue?.data ? prevValue.data : null
          acc[id] = {data: value, isPending: true}
          return acc
        }, {})
        return {values: {...prev.values, ...pendingValues}}
      })
    }),
    withLatestFrom(documentProjections$),
    map(([[, ids], documentProjections]) => ({ids, documentProjections})),
  )

  return combineLatest([newSubscriberIds$])
    .pipe(
      switchMap(([{ids, documentProjections}]) => {
        if (!ids.size) return EMPTY
        const {query, params} = createProjectionQuery(ids, documentProjections)
        return getQueryState<ProjectionQueryResult[]>(instance, query, {
          params,
          tag: PROJECTION_TAG,
        }).observable.pipe(
          filter((result) => result !== undefined),
          map((data) => ({data, ids})),
        )
      }),
      map(({ids, data}) => ({
        values: processProjectionQuery({
          projectId: instance.config.projectId!,
          dataset: instance.config.dataset!,
          ids,
          results: data,
        }),
      })),
    )
    .subscribe({
      next: ({values}) => {
        state.set('updateResult', (prev) => ({
          values: {...prev.values, ...values},
        }))
      },
    })
}

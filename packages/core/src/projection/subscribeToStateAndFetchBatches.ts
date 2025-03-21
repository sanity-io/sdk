import {isEqual} from 'lodash-es'
import {
  combineLatest,
  debounceTime,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  map,
  Observable,
  pairwise,
  startWith,
  Subscription,
  switchMap,
  tap,
} from 'rxjs'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {type StoreContext} from '../store/defineStore'
import {createProjectionQuery, processProjectionQuery} from './projectionQuery'
import {type ProjectionQueryResult, type ProjectionStoreState} from './projectionStore'
import {PROJECTION_PERSPECTIVE, PROJECTION_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

const isSetEqual = <T>(a: Set<T>, b: Set<T>) =>
  a.size === b.size && Array.from(a).every((i) => b.has(i))

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
    distinctUntilChanged(isSetEqual),
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
    map(([, ids]) => ids),
    distinctUntilChanged(isSetEqual),
  )

  return combineLatest([newSubscriberIds$, documentProjections$])
    .pipe(
      distinctUntilChanged(isEqual),
      switchMap(([ids, documentProjections]) => {
        if (!ids.size) return EMPTY
        const {query, params} = createProjectionQuery(ids, documentProjections)
        const controller = new AbortController()

        return new Observable<ProjectionQueryResult[]>((observer) => {
          const {getCurrent, observable} = getQueryState<ProjectionQueryResult[]>(instance, query, {
            params,
            tag: PROJECTION_TAG,
            perspective: PROJECTION_PERSPECTIVE,
          })

          const source$ = defer(() => {
            if (getCurrent() === undefined) {
              return from(
                resolveQuery<ProjectionQueryResult[]>(instance, query, {
                  params,
                  tag: PROJECTION_TAG,
                  perspective: PROJECTION_PERSPECTIVE,
                  signal: controller.signal,
                }),
              ).pipe(switchMap(() => observable))
            }
            return observable
          }).pipe(filter((result) => result !== undefined))

          const subscription = source$.subscribe(observer)

          return () => {
            if (!controller.signal.aborted) {
              controller.abort()
            }
            subscription.unsubscribe()
          }
        }).pipe(map((data) => ({data, ids})))
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

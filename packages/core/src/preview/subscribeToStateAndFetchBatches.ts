import {
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
import {createPreviewQuery, processPreviewQuery} from './previewQuery'
import {type PreviewQueryResult, type PreviewStoreState} from './previewStore'
import {PREVIEW_PERSPECTIVE, PREVIEW_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

const isSetEqual = <T>(a: Set<T>, b: Set<T>) =>
  a.size === b.size && Array.from(a).every((i) => b.has(i))

export const subscribeToStateAndFetchBatches = ({
  state,
  instance,
}: StoreContext<PreviewStoreState>): Subscription => {
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
        const pendingValues = newIds.reduce<PreviewStoreState['values']>((acc, id) => {
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

  return newSubscriberIds$
    .pipe(
      switchMap((ids) => {
        if (!ids.size) return EMPTY
        const {query, params} = createPreviewQuery(ids)
        const controller = new AbortController()
        return new Observable<PreviewQueryResult[]>((observer) => {
          const {getCurrent, observable} = getQueryState<PreviewQueryResult[]>(instance, query, {
            params,
            tag: PREVIEW_TAG,
            perspective: PREVIEW_PERSPECTIVE,
          })
          const source$ = defer(() => {
            if (getCurrent() === undefined) {
              return from(
                resolveQuery<PreviewQueryResult[]>(instance, query, {
                  params,
                  tag: PREVIEW_TAG,
                  perspective: PREVIEW_PERSPECTIVE,
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
        values: processPreviewQuery({
          projectId: instance.config.projectId!,
          dataset: instance.config.dataset!,
          ids,
          results: data,
        }),
      })),
    )
    .subscribe({
      next: ({values}) => {
        state.set('updateResult', (prev) => ({values: {...prev.values, ...values}}))
      },
    })
}

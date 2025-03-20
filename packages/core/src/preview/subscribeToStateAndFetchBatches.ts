import {
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
import {createPreviewQuery, processPreviewQuery} from './previewQuery'
import {type PreviewQueryResult, type PreviewStoreState} from './previewStore'
import {PREVIEW_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

export const subscribeToStateAndFetchBatches = ({
  state,
  instance,
}: StoreContext<PreviewStoreState>): Subscription => {
  const documentTypes$ = state.observable.pipe(
    map((i) => i.documentTypes),
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
        const pendingValues = newIds.reduce<PreviewStoreState['values']>((acc, id) => {
          const prevValue = prev.values[id]
          const value = prevValue?.data ? prevValue.data : null
          acc[id] = {data: value, isPending: true}
          return acc
        }, {})
        return {values: {...prev.values, ...pendingValues}}
      })
    }),
    withLatestFrom(documentTypes$),
    map(([[, ids], documentTypes]) => ({ids, documentTypes})),
  )

  return newSubscriberIds$
    .pipe(
      switchMap(({ids}) => {
        if (!ids.size) return EMPTY
        const {query, params} = createPreviewQuery(ids)
        return getQueryState<PreviewQueryResult[]>(instance, query, {
          params,
          tag: PREVIEW_TAG,
        }).observable.pipe(
          filter(Boolean),
          map((result) => ({result, ids})),
        )
      }),
      map(({ids, result}) => ({
        values: processPreviewQuery({
          projectId: instance.config.projectId!,
          dataset: instance.config.dataset!,
          ids,
          results: result,
        }),
      })),
    )
    .subscribe({
      next: ({values}) => {
        state.set('updateResult', (prev) => ({values: {...prev.values, ...values}}))
      },
    })
}

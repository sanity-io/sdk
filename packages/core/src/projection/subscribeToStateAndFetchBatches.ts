import {type SanityClient, type SyncTag} from '@sanity/client'
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  pairwise,
  startWith,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {createProjectionQuery, processProjectionQuery} from './projectionQuery'
import {type ProjectionQueryResult, type ProjectionStoreState} from './projectionStore'
import {PROJECTION_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

export const subscribeToStateAndFetchBatches = createInternalAction(
  ({state, instance}: ActionContext<ProjectionStoreState>) => {
    return function () {
      const client$ = new Observable<SanityClient>((observer) =>
        getClientState(instance, {apiVersion: 'vX'}).observable.subscribe(observer),
      )

      const documentProjections$ = state.observable.pipe(
        map((i) => i.documentProjections),
        distinctUntilChanged(),
      )
      const lastLiveEventId$ = state.observable.pipe(
        map((i) => i.lastLiveEventId),
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

      return combineLatest([newSubscriberIds$, lastLiveEventId$, client$])
        .pipe(
          switchMap(([{ids, documentProjections}, lastLiveEventId, client]) => {
            if (!ids.size) return EMPTY
            const {query, params} = createProjectionQuery(ids, documentProjections)

            return client.observable
              .fetch<ProjectionQueryResult[]>(query, params, {
                filterResponse: false,
                returnQuery: false,
                perspective: 'drafts',
                tag: PROJECTION_TAG,
                lastLiveEventId,
              })
              .pipe(map((response) => ({...response, ids})))
          }),
          map(({ids, result, syncTags}) => ({
            syncTags,
            values: processProjectionQuery({
              projectId: instance.identity.projectId,
              dataset: instance.identity.dataset,
              ids,
              results: result,
            }),
          })),
        )
        .subscribe({
          next: ({syncTags = [], values}) => {
            state.set('updateResult', (prev) => ({
              values: {...prev.values, ...values},
              syncTags: syncTags.reduce<Record<SyncTag, true>>((acc, next) => {
                acc[next] = true
                return acc
              }, {}),
            }))
          },
        })
    }
  },
)

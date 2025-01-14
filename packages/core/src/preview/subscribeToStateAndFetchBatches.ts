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

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {getSchemaState} from '../schema/getSchemaState'
import {createPreviewQuery, processPreviewQuery} from './previewQuery'
import {type PreviewQueryResult, type PreviewStoreState} from './previewStore'
import {PREVIEW_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

export const subscribeToStateAndFetchBatches = createInternalAction(
  ({state, instance}: ActionContext<PreviewStoreState>) => {
    return function () {
      const client$ = new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
      )
      const schema$ = getSchemaState(instance).observable
      const documentTypes$ = state.observable.pipe(
        map((i) => i.documentTypes),
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
            const pendingValues = newIds.reduce<PreviewStoreState['values']>((acc, id) => {
              const prevValue = prev.values[id]
              const value = Array.isArray(prevValue) ? prevValue[0] : null
              acc[id] = [value, true]
              return acc
            }, {})
            return {values: {...prev.values, ...pendingValues}}
          })
        }),
        withLatestFrom(documentTypes$),
        map(([[, ids], documentTypes]) => ({ids, documentTypes})),
      )

      return combineLatest([newSubscriberIds$, lastLiveEventId$, client$, schema$])
        .pipe(
          switchMap(([{ids, documentTypes}, lastLiveEventId, client, schema]) => {
            if (!ids.size) return EMPTY
            const {query, params} = createPreviewQuery(ids, documentTypes, schema)

            return client.observable
              .fetch<PreviewQueryResult[]>(query, params, {
                filterResponse: false,
                returnQuery: false,
                tag: PREVIEW_TAG,
                lastLiveEventId,
              })
              .pipe(map((response) => ({...response, ids, schema, documentTypes})))
          }),
          map(({ids, result, syncTags, documentTypes, schema}) => ({
            syncTags,
            values: processPreviewQuery({
              projectId: instance.identity.projectId,
              dataset: instance.identity.dataset,
              ids,
              documentTypes,
              results: result,
              schema,
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

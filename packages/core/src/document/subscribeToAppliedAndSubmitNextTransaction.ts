import {type Action, type SanityClient} from '@sanity/client'
import {
  catchError,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  Observable,
  tap,
  throttleTime,
  withLatestFrom,
} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {type DocumentAction} from './actions'
import {addOutgoingTransaction} from './addOutgoingTransaction'
import {createOutgoingTransaction} from './createOutgoingTransaction'
import {type DocumentEvent, type DocumentStoreState} from './documentStore'
import {revertOutgoingTransaction} from './revertOutgoingTransaction'

const API_VERSION = 'vX'
const SUBMIT_THROTTLE_TIME = 2000

function createDocumentEvents(transactionId: string, actions: DocumentAction[]) {
  const documentIdsByAction = Object.entries(
    actions.reduce(
      (acc, {type, documentId}) => {
        const ids = acc[type] || new Set()
        ids.add(documentId)
        acc[type] = ids
        return acc
      },
      {} as Record<DocumentAction['type'], Set<string>>,
    ),
  ) as [DocumentAction['type'], Set<string>][]

  const actionMap = {
    'document.create': 'created',
    'document.delete': 'deleted',
    'document.discard': 'discarded',
    'document.edit': 'edited',
    'document.publish': 'published',
    'document.unpublish': 'unpublished',
  } satisfies Record<DocumentAction['type'], DocumentEvent['type']>

  return documentIdsByAction.flatMap(([actionType, documentIds]) =>
    Array.from(documentIds).map(
      (documentId): DocumentEvent => ({type: actionMap[actionType], documentId, transactionId}),
    ),
  )
}

export const subscribeToAppliedAndSubmitNextTransaction = createInternalAction(
  ({state, instance}: ActionContext<DocumentStoreState>) => {
    const {events} = state.get()
    const client$ = new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: API_VERSION}).subscribe(observer),
    )

    return function () {
      const outgoing$ = state.observable.pipe(
        map((s) => s.applied),
        distinctUntilChanged(),
        throttleTime(SUBMIT_THROTTLE_TIME, undefined, {trailing: true, leading: false}),
        map(createOutgoingTransaction),
        filter(Boolean),
        distinctUntilChanged((a, b) => a.transactionId === b.transactionId),
      )

      const updates$ = outgoing$.pipe(
        tap((transaction) => {
          state.set('addOutgoing', (prev) => addOutgoingTransaction({...prev, transaction}))
        }),
        withLatestFrom(client$),
        concatMap(([{outgoingActions, transactionId, actions}, client]) =>
          client.observable
            .action(outgoingActions as Action[], {
              transactionId,
              skipCrossDatasetReferenceValidation: true,
            })
            .pipe(
              catchError((error) => {
                events.next({
                  type: 'reverted',
                  message: error.message,
                  transactionId,
                  error,
                })
                state.set('revertOutgoingTransaction', (prev) =>
                  revertOutgoingTransaction({transactionId, ...prev}),
                )
                return EMPTY
              }),
              map((result) => ({result, transactionId, actions})),
            ),
        ),
        tap(({actions, transactionId, result}) => {
          state.set('removeOutgoing', (prev) => ({
            outgoing: prev.outgoing.filter((i) => transactionId !== i.transactionId),
          }))

          for (const event of createDocumentEvents(result.transactionId, actions)) {
            events.next(event)
          }
          events.next({type: 'submitted', transactionId, result})
        }),
      )

      return updates$.subscribe({
        error: (error) => state.set('setError', {error}),
      })
    }
  },
)

import {type Action, type SanityClient} from '@sanity/client'
import {
  catchError,
  concatMap,
  delay,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  map,
  Observable,
  tap,
  throttle,
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
        // throttles applied transactions at the rate of outgoing transactions
        throttle(
          () =>
            state.observable.pipe(
              first((s) => !s.outgoing.length),
              // need a delay for test env because applied transactions needs to
              // be transitioned an outgoing transaction before the next throttle
              // observable input fires else this will stall
              delay(0),
            ),
          {leading: false, trailing: true},
        ),
        map(createOutgoingTransaction),
        filter(Boolean),
        distinctUntilChanged((a, b) => a.transactionId === b.transactionId),
      )

      const updates$ = outgoing$.pipe(
        tap((transaction) => {
          state.set('addOutgoing', (prev) => addOutgoingTransaction({...prev, transaction}))
        }),
        withLatestFrom(client$),
        concatMap(([{outgoingActions, transactionId, actions, consumedTransactions}, client]) =>
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
                  consumedTransactions,
                  error,
                })
                state.set('revertOutgoingTransaction', (prev) =>
                  revertOutgoingTransaction({transactionId, ...prev}),
                )
                return EMPTY
              }),
              map((result) => ({result, transactionId, consumedTransactions, actions})),
            ),
        ),
        tap(({actions, transactionId, consumedTransactions, result}) => {
          state.set('removeOutgoing', (prev) => ({
            outgoing: prev.outgoing.filter((i) => transactionId !== i.transactionId),
          }))

          for (const event of createDocumentEvents(result.transactionId, actions)) {
            events.next(event)
          }
          events.next({type: 'submitted', transactionId, consumedTransactions, result})
        }),
      )

      return updates$.subscribe({
        error: (error) => state.set('setError', {error}),
      })
    }
  },
)

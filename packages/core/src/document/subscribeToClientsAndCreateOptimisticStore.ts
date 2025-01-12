import type {SanityClient} from '@sanity/client'
import {SanityEncoder, type Transaction} from '@sanity/mutate'
import {
  createDocumentEventListener,
  createDocumentLoaderFromClient,
  createOptimisticStore,
  createSharedListenerFromClient,
  type MutationResult,
} from '@sanity/mutate/_unstable_store'
import {concatMap, from, Observable} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import type {DocumentStoreState} from './documentStore'

const API_VERSION = '2023-10-27'

export const createSubmitFromClient =
  (client: Pick<SanityClient, 'dataRequest'>) =>
  (transactions: Transaction[]): Observable<MutationResult[]> =>
    from(transactions).pipe(
      concatMap((transaction) =>
        client.dataRequest('mutate', SanityEncoder.encodeTransaction(transaction), {
          visibility: 'async',
          returnDocuments: false,
        }),
      ),
    )

export const subscribeToClientsAndCreateOptimisticStore = createInternalAction(
  ({state, instance}: ActionContext<DocumentStoreState>) => {
    const client$ = new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: API_VERSION}).subscribe(observer),
    )

    return function () {
      return client$.subscribe({
        next: (client) => {
          const sharedListener = createSharedListenerFromClient(client)
          const loadDocument = createDocumentLoaderFromClient(client)
          const listen = createDocumentEventListener({
            loadDocument,
            listenerEvents: sharedListener,
          })
          const submit = createSubmitFromClient(client)

          const optimisticStore = createOptimisticStore({
            listen,
            submit,
          })

          state.set('setOptimisticStore', {optimisticStore})
        },
        error: (error) => state.set('setError', {error}),
      })
    }
  },
)

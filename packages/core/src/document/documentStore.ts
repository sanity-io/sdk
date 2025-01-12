import {type OptimisticStore} from '@sanity/mutate/_unstable_store'
import type {SanityDocumentLike} from '@sanity/types'

import {createResource, type Resource} from '../resources/createResource'
import {subscribeToClientsAndCreateOptimisticStore} from './subscribeToClientsAndCreateOptimisticStore'
import {subscribeToStateAndListenToActiveDocuments} from './subscribeToStateAndListenToActiveDocuments'
import {subscribeToStateAndSubmitMutations} from './subscribeToStateAndSubmitMutations'

export interface DocumentStoreState {
  documents: {[TDocumentId in string]?: SanityDocumentLike | null}
  subscriptions: {[TDocumentId in string]?: string[]}
  optimisticStore: OptimisticStore | null
  mutationRefreshKey: string | null
  error?: unknown
}

export const getDocumentStore = (): Resource<DocumentStoreState> => documentStore

const initialState: DocumentStoreState = {
  documents: {},
  subscriptions: {},
  optimisticStore: null,
  mutationRefreshKey: null,
}

export const documentStore = createResource<DocumentStoreState>({
  name: 'Document',
  getInitialState: () => initialState,
  initialize() {
    const clientsSubscription = subscribeToClientsAndCreateOptimisticStore(this)
    const activeDocumentsSubscription = subscribeToStateAndListenToActiveDocuments(this)
    const mutationSubmissionsSubscription = subscribeToStateAndSubmitMutations(this)

    return () => {
      clientsSubscription.unsubscribe()
      activeDocumentsSubscription.unsubscribe()
      mutationSubmissionsSubscription.unsubscribe()
    }
  },
})

import {afterEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {documentStore, getDocumentStore} from './documentStore'
import {subscribeToClientsAndCreateOptimisticStore} from './subscribeToClientsAndCreateOptimisticStore'
import {subscribeToStateAndListenToActiveDocuments} from './subscribeToStateAndListenToActiveDocuments'
import {subscribeToStateAndSubmitMutations} from './subscribeToStateAndSubmitMutations'

vi.mock('./subscribeToClientsAndCreateOptimisticStore', () => ({
  subscribeToClientsAndCreateOptimisticStore: vi.fn().mockReturnValue({unsubscribe: vi.fn()}),
}))

vi.mock('./subscribeToStateAndListenToActiveDocuments', () => ({
  subscribeToStateAndListenToActiveDocuments: vi.fn(() => ({unsubscribe: vi.fn()})),
}))

vi.mock('./subscribeToStateAndSubmitMutations', () => ({
  subscribeToStateAndSubmitMutations: vi.fn(() => ({unsubscribe: vi.fn()})),
}))

describe('documentStore', () => {
  const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getInitialState returns the expected state', () => {
    const initial = documentStore.getInitialState(instance)
    expect(initial).toEqual({
      optimisticStore: null,
      subscriptions: {},
      documents: {},
      mutationRefreshKey: null,
    })
  })

  it('initialize sets up the right subscriptions and returns cleanup function', () => {
    const resourceState = createResourceState(documentStore.getInitialState(instance))
    const dispose = documentStore.initialize?.call({instance, state: resourceState}, instance)
    expect(subscribeToClientsAndCreateOptimisticStore).toHaveBeenCalledTimes(1)
    expect(subscribeToStateAndListenToActiveDocuments).toHaveBeenCalledTimes(1)
    expect(subscribeToStateAndSubmitMutations).toHaveBeenCalledTimes(1)

    const clientsSubscription = vi.mocked(subscribeToClientsAndCreateOptimisticStore).mock
      .results[0].value
    const activeDocumentsSubscription = vi.mocked(subscribeToStateAndListenToActiveDocuments).mock
      .results[0].value
    const mutationSubmissionsSubscription = vi.mocked(subscribeToStateAndSubmitMutations).mock
      .results[0].value

    expect(clientsSubscription.unsubscribe).not.toHaveBeenCalled()
    expect(activeDocumentsSubscription.unsubscribe).not.toHaveBeenCalled()
    expect(mutationSubmissionsSubscription.unsubscribe).not.toHaveBeenCalled()

    dispose?.()

    expect(clientsSubscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(activeDocumentsSubscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(mutationSubmissionsSubscription.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('getDocumentStore', () => {
  it('returns the documentStore resource', () => {
    expect(getDocumentStore()).toBe(documentStore)
  })
})

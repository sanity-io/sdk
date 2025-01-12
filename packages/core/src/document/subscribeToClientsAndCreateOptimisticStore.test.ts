import type {SanityClient} from '@sanity/client'
import {
  createDocumentEventListener,
  createDocumentLoaderFromClient,
  createOptimisticStore,
  createSharedListenerFromClient,
  type OptimisticStore,
} from '@sanity/mutate/_unstable_store'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {documentStore, type DocumentStoreState} from './documentStore'
import {
  createSubmitFromClient,
  subscribeToClientsAndCreateOptimisticStore,
} from './subscribeToClientsAndCreateOptimisticStore'

vi.mock('../client/actions/getSubscribableClient', () => ({
  getSubscribableClient: vi.fn(),
}))

vi.mock('@sanity/mutate/_unstable_store')

describe('subscribeToClientsAndCreateOptimisticStore', () => {
  const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  const initialState = documentStore.getInitialState(instance)
  let state: ResourceState<DocumentStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('subscribes to a client stream and creates an optimisticStore', () => {
    const client$ = new Subject<SanityClient>()
    const mockOptimisticStore = {} as unknown as OptimisticStore
    vi.mocked(getSubscribableClient).mockReturnValue(client$)
    vi.mocked(createOptimisticStore).mockReturnValue(mockOptimisticStore)

    const subscription = subscribeToClientsAndCreateOptimisticStore({instance, state})
    expect(createSharedListenerFromClient).not.toHaveBeenCalled()
    expect(createDocumentLoaderFromClient).not.toHaveBeenCalled()
    expect(createDocumentEventListener).not.toHaveBeenCalled()
    expect(createOptimisticStore).not.toHaveBeenCalled()

    const mockClient = {} as unknown as SanityClient
    client$.next(mockClient)

    expect(createSharedListenerFromClient).toHaveBeenCalledTimes(1)
    expect(createDocumentLoaderFromClient).toHaveBeenCalledTimes(1)
    expect(createDocumentEventListener).toHaveBeenCalledTimes(1)
    expect(createOptimisticStore).toHaveBeenCalledTimes(1)

    expect(state.get().optimisticStore).toBe(mockOptimisticStore)

    subscription.unsubscribe()
  })

  it('sets an error if any occur from the client stream', () => {
    const client$ = new Subject<SanityClient>()
    vi.mocked(getSubscribableClient).mockReturnValue(client$)

    subscribeToClientsAndCreateOptimisticStore({instance, state})
    expect(state.get().error).toBe(undefined)

    const testError = new Error('test error')
    client$.error(testError)

    expect(state.get().error).toBe(testError)
  })
})

describe('createSubmitFromClient', () => {
  it('returns a function that applies mutations one-by-one via `client.dataRequest`', async () => {
    const dataRequest = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const submit = createSubmitFromClient({dataRequest})

    const request = submit([
      {id: 'transaction1', mutations: []},
      {id: 'transaction2', mutations: []},
    ])

    expect(dataRequest).not.toHaveBeenCalled()

    // the first request will be fired on subscribe
    request.subscribe()
    expect(dataRequest).toHaveBeenCalledTimes(1)

    // second request needs to wait for a tick because of the setTimeout above
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dataRequest).toHaveBeenCalledTimes(2)
  })
})

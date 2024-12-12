import {createClient} from '@sanity/client'
import {Subscription} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../dist'
import {config} from '../../test/fixtures'
import {subscribeToAuthEvents} from './actions/subscribeToAuthEvents'
import {clientStore, getClientStore} from './clientStore'

// Mock dependencies
vi.mock('@sanity/client', () => ({
  createClient: vi.fn(() => ({})),
}))

vi.mock('./actions/subscribeToAuthEvents', () => ({
  subscribeToAuthEvents: vi.fn(() => ({
    unsubscribe: vi.fn(),
  })),
}))

describe('clientStore', () => {
  const instance = createSanityInstance(config)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('store creation should have the correct store key', () => {
    expect(clientStore.key).toBe('clientStore')
  })

  it('store creation should return null context', () => {
    const context = clientStore.getContext({instance})
    expect(context).toBeNull()
  })

  it('should create initial state with default client', () => {
    const initialState = clientStore.getInitialState({
      instance,
      context: null,
    })

    expect(createClient).toHaveBeenCalledWith({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
      token: undefined,
      useCdn: false,
      apiVersion: 'v2024-11-12',
    })

    expect(initialState).toMatchObject({
      defaultClient: expect.any(Object),
      clients: expect.any(Map),
    })

    expect(initialState.clients.get('v2024-11-12')).toBe(initialState.defaultClient)
  })

  it('initial state should create initial state with relevant configuration', () => {
    clientStore.getInitialState({
      instance,
      context: null,
    })

    expect(createClient).toHaveBeenCalledWith({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
      token: undefined,
      useCdn: false,
      apiVersion: 'v2024-11-12',
    })

    const token = 'test-token'
    const instanceWithAuth = createSanityInstance({
      ...config,
      auth: {token},
    })

    clientStore.getInitialState({
      instance: instanceWithAuth,
      context: null,
    })

    expect(createClient).toHaveBeenCalledWith({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
      token,
      useCdn: false,
      apiVersion: 'v2024-11-12',
    })
  })

  it('should subscribe to auth events and return cleanup function', () => {
    const unsubscribeSpy = vi.fn()
    const mockSubscription = {
      unsubscribe: unsubscribeSpy,
    } as unknown as Subscription

    vi.mocked(subscribeToAuthEvents).mockReturnValue(mockSubscription)

    const cleanup = clientStore.initialize({
      instance,
      context: null,
    })

    expect(subscribeToAuthEvents).toHaveBeenCalledWith(instance)

    cleanup()
    expect(unsubscribeSpy).toHaveBeenCalled()
  })

  it('should return the same store instance for the same identity', () => {
    const store1 = getClientStore(instance)
    const store2 = getClientStore(instance)

    expect(store1).toBe(store2)
  })

  it('should return different store instances for different identities', () => {
    const instance2 = createSanityInstance({
      projectId: 'test-project-id-2',
      dataset: 'test-dataset-2',
    })

    // Get the initialized resources
    const store1 = getClientStore(instance)
    const store2 = getClientStore(instance2)

    const state1 = store1.getInitialState({instance, context: null})
    const state2 = store2.getInitialState({instance: instance2, context: null})
    expect(state1).not.toBe(state2)
  })
})

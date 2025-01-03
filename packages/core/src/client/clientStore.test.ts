import type {Subscription} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {config} from '../../test/fixtures'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, getOrCreateResource} from '../resources/createResource'
import {subscribeToAuthEvents} from './actions/subscribeToAuthEvents'
import {clientStore} from './clientStore'

vi.mock('./actions/subscribeToAuthEvents', () => ({
  subscribeToAuthEvents: vi.fn(),
}))

describe('clientStore', () => {
  describe('initialization', () => {
    it('creates initial state without token', () => {
      const instance = createSanityInstance(config)
      const store = getOrCreateResource(instance, clientStore)
      const state = store.state.get()

      expect(state.defaultClient.config()).toEqual(
        expect.objectContaining({
          projectId: config.projectId,
          dataset: config.dataset,
          token: undefined,
          useCdn: false,
          apiVersion: '2024-11-12',
        }),
      )
    })

    it('creates initial state with token', () => {
      const instance = createSanityInstance({
        ...config,
        auth: {
          token: 'foo',
        },
      })
      const store = getOrCreateResource(instance, clientStore)
      const state = store.state.get()
      expect(state.defaultClient.config().token).toBe('foo')
    })

    it('initializes clients Map with default client', () => {
      const instance = createSanityInstance(config)
      const store = getOrCreateResource(instance, clientStore)
      const state = store.state.get()

      expect(state.clients.size).toBe(1)
      expect(state.clients.get('2024-11-12')).toBe(state.defaultClient)
    })

    it('maintains separate stores for different instances', () => {
      const instance1 = createSanityInstance({...config, projectId: 'project1'})
      const instance2 = createSanityInstance({...config, projectId: 'project2'})

      const store1 = getOrCreateResource(instance1, clientStore)
      const store2 = getOrCreateResource(instance2, clientStore)

      expect(store1.state.get().defaultClient.config().projectId).toBe('project1')
      expect(store2.state.get().defaultClient.config().projectId).toBe('project2')
    })
  })

  it('should subscribe to auth events and return cleanup function', () => {
    const instance = createSanityInstance(config)
    const unsubscribeSpy = vi.fn()
    const mockSubscription = {
      unsubscribe: unsubscribeSpy,
    } as unknown as Subscription

    vi.mocked(subscribeToAuthEvents).mockImplementation(() => mockSubscription)
    const initialState = clientStore.getInitialState(instance)

    const dispose = clientStore.initialize!.call(
      {
        instance,
        state: createResourceState(initialState),
      },
      instance,
    )
    expect(subscribeToAuthEvents).toHaveBeenCalled()

    dispose()
    expect(unsubscribeSpy).toHaveBeenCalled()
  })
})

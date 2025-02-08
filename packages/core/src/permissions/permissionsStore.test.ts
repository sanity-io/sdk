import {type Subscription} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {config} from '../../test/fixtures'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, getOrCreateResource} from '../resources/createResource'
import {subscribeToAuthEvents} from './actions/subscribeToAuthEvents'
import {permissionsStore} from './permissionsStore'

// Mock the subscribeToAuthEvents module
vi.mock('./actions/subscribeToAuthEvents', () => ({
  subscribeToAuthEvents: vi.fn(),
}))

describe('permissionsStore', () => {
  describe('initialization', () => {
    it('creates initial state', () => {
      const instance = createSanityInstance(config)
      const store = getOrCreateResource(instance, permissionsStore)
      const state = store.state.get()

      expect(state).toEqual({
        permissions: [],
      })
    })

    it('maintains separate stores for different instances', () => {
      const instance1 = createSanityInstance({...config, projectId: 'project1'})
      const instance2 = createSanityInstance({...config, projectId: 'project2'})

      const store1 = getOrCreateResource(instance1, permissionsStore)
      const store2 = getOrCreateResource(instance2, permissionsStore)

      expect(store1).not.toBe(store2)
      expect(store1.state.get()).toEqual({permissions: []})
      expect(store2.state.get()).toEqual({permissions: []})
    })
  })

  it('should subscribe to auth events and return cleanup function', () => {
    const instance = createSanityInstance(config)
    const unsubscribeSpy = vi.fn()
    const mockSubscription = {
      unsubscribe: unsubscribeSpy,
    } as unknown as Subscription

    vi.mocked(subscribeToAuthEvents).mockImplementation(() => mockSubscription)
    const initialState = permissionsStore.getInitialState(instance)

    const dispose = permissionsStore.initialize!.call(
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

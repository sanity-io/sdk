import {describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import type {SanityInstance} from '../../instance/types'
import {createResourceState, getOrCreateResource} from '../../resources/createResource'
import {createController} from './actions/createController'
import {comlinkControllerStore} from './comlinkControllerStore'

describe('comlinkStore', () => {
  let instance: SanityInstance
  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('should have correct initial state', () => {
    const store = getOrCreateResource(instance, comlinkControllerStore)
    const initialState = store.state.get()

    expect(initialState.controller).toBeNull()
    expect(initialState.channels).toBeInstanceOf(Map)
    expect(initialState.channels.size).toBe(0)
  })

  it('should cleanup controller on dispose', () => {
    // Create instance and initialize controller
    const controller = createController(instance, 'https://test.sanity.dev')
    const destroySpy = vi.spyOn(controller!, 'destroy')

    // Get initial state and create resource state
    const initialState = comlinkControllerStore.getInitialState(instance)
    initialState.controller = controller // Set the controller in our initial state

    const dispose = comlinkControllerStore.initialize!.call(
      {
        instance,
        state: createResourceState(initialState),
      },
      instance,
    )

    // Run cleanup
    dispose?.()

    // Verify controller.destroy was called
    expect(destroySpy).toHaveBeenCalled()
  })

  it('should handle cleanup when no controller exists', () => {
    const cleanup = comlinkControllerStore.initialize!.call(
      {
        instance,
        state: createResourceState(comlinkControllerStore.getInitialState(instance)),
      },
      instance,
    )

    // Should not throw when no controller exists
    expect(() => cleanup?.()).not.toThrow()
  })
})

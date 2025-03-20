import {type Controller} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../../store/createSanityInstance'
import {createStoreState} from '../../../store/createStoreState'
import {type ComlinkControllerState} from '../comlinkControllerStore'
import {destroyController} from './destroyController'

describe('destroyController', () => {
  const instance = createSanityInstance({
    projectId: 'test-project-id',
    dataset: 'test-dataset',
  })
  let state: ReturnType<typeof createStoreState<ComlinkControllerState>>
  let mockController: {destroy: ReturnType<typeof vi.fn>}

  beforeEach(() => {
    mockController = {
      destroy: vi.fn(),
    }

    // Initialize test store state
    state = createStoreState<ComlinkControllerState>({
      controller: null,
      controllerOrigin: null,
      channels: new Map(),
    })
  })

  afterEach(() => {
    instance.dispose()
  })

  it('should destroy controller and clear state', () => {
    // Set up test state with a controller
    state.set('setup', {
      controller: mockController as unknown as Controller,
      controllerOrigin: 'https://test.sanity.dev',
    })

    // Execute action
    destroyController({state, instance})

    // Verify controller was destroyed and state was cleared
    expect(mockController.destroy).toHaveBeenCalled()
    expect(state.get().controller).toBeNull()
    expect(state.get().channels.size).toBe(0)
  })

  it('should do nothing if no controller exists', () => {
    // State already has null controller, so just execute action
    expect(() => destroyController({state, instance})).not.toThrow()

    // State should remain unchanged
    expect(state.get().controller).toBeNull()
  })
})

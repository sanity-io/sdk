import {type Controller} from '@sanity/comlink'
import {describe, expect, it, vi} from 'vitest'

import {bindActionGlobally} from '../../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../../store/createSanityInstance'
import {} from '../../store/createStateSourceAction'
import {createStoreState} from '../../store/createStoreState'
import {type ComlinkControllerState} from './comlinkControllerStore'

vi.mock('../../store/createActionBinder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/createActionBinder')>()),
  bindActionGlobally: vi.fn(),
}))

describe('comlinkControllerStore', () => {
  let instance: SanityInstance
  beforeEach(() => {
    vi.resetModules()
    instance = createSanityInstance({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    })
  })

  afterEach(() => {
    instance.dispose()
  })

  it('should have correct initial state', async () => {
    const {comlinkControllerStore} = await import('./comlinkControllerStore')

    // Create store state directly
    const state = createStoreState<ComlinkControllerState>(
      comlinkControllerStore.getInitialState(instance),
    )

    const initialState = state.get()

    expect(initialState.controller).toBeNull()
    expect(initialState.channels).toBeInstanceOf(Map)
    expect(initialState.channels.size).toBe(0)
  })

  it('should cleanup controller on dispose', async () => {
    const controller = {
      destroy: vi.fn() as Controller['destroy'],
    } as Controller

    // Set up state with controller
    const state = createStoreState<ComlinkControllerState>({
      controller,
      controllerOrigin: 'https://test.sanity.dev',
      channels: new Map(),
    })

    vi.mocked(bindActionGlobally).mockImplementation(
      (_storeDef, action) =>
        (inst: SanityInstance, ...params: unknown[]) =>
          action({instance: inst, state}, ...params),
    )

    const {comlinkControllerStore} = await import('./comlinkControllerStore')

    // Get the cleanup function from the store
    const dispose = comlinkControllerStore.initialize?.({state, instance})

    // Run cleanup
    dispose?.()

    // Verify controller.destroy was called
    expect(controller.destroy).toHaveBeenCalled()
  })

  it('should handle cleanup when no controller exists', async () => {
    const {comlinkControllerStore} = await import('./comlinkControllerStore')

    // Set up state with no controller
    const state = createStoreState<ComlinkControllerState>({
      controller: null,
      controllerOrigin: null,
      channels: new Map(),
    })

    // Get the cleanup function
    const cleanup = comlinkControllerStore.initialize?.({state, instance})

    // Should not throw when no controller exists
    expect(() => cleanup?.()).not.toThrow()
  })
})

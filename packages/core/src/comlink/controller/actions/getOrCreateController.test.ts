import * as comlink from '@sanity/comlink'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../../../store/createSanityInstance'
import {createStoreState} from '../../../store/createStoreState'
import {type ComlinkControllerState} from '../comlinkControllerStore'
import {getOrCreateController} from './getOrCreateController'

vi.mock('@sanity/comlink', () => {
  return {
    createController: vi.fn(() => ({
      addTarget: vi.fn(),
      createChannel: vi.fn(),
      destroy: vi.fn(),
    })),
  }
})

describe('getOrCreateController', () => {
  let instance: SanityInstance
  let state: ReturnType<typeof createStoreState<ComlinkControllerState>>

  beforeEach(() => {
    instance = createSanityInstance({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    })

    state = createStoreState<ComlinkControllerState>({
      controller: null,
      controllerOrigin: null,
      channels: new Map(),
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    instance.dispose()
  })

  it('should create a new controller if none exists', () => {
    const controllerSpy = vi.spyOn(comlink, 'createController')
    const targetOrigin = 'https://test.sanity.dev'

    const controller = getOrCreateController({state, instance}, targetOrigin)

    expect(controllerSpy).toHaveBeenCalledWith({targetOrigin})
    expect(controller).toBeDefined()
    expect(controller.destroy).toBeDefined() // Verify it's a real controller
    expect(state.get().controller).toBe(controller)
    expect(state.get().controllerOrigin).toBe(targetOrigin)
  })

  it('should return existing controller if one exists', () => {
    const controllerSpy = vi.spyOn(comlink, 'createController')
    const targetOrigin = 'https://test.sanity.dev'

    const firstController = getOrCreateController({state, instance}, targetOrigin)
    const secondController = getOrCreateController({state, instance}, targetOrigin)

    expect(controllerSpy).toHaveBeenCalledTimes(1)
    expect(firstController).toBe(secondController)
  })

  it('should destroy existing controller if target origin changes', () => {
    const controllerSpy = vi.spyOn(comlink, 'createController')
    const targetOrigin = 'https://test.sanity.dev'
    const targetOrigin2 = 'https://test2.sanity.dev'

    const firstController = getOrCreateController({state, instance}, targetOrigin)
    const destroySpy = vi.spyOn(firstController, 'destroy')
    const secondController = getOrCreateController({state, instance}, targetOrigin2)

    expect(controllerSpy).toHaveBeenCalledTimes(2)
    expect(destroySpy).toHaveBeenCalled()
    expect(firstController).not.toBe(secondController)
    expect(state.get().controllerOrigin).toBe(targetOrigin2)
  })
})

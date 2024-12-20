import * as comlink from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkControllerStore} from '../comlinkControllerStore'
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

  beforeEach(() => {
    instance = createSanityInstance(config)
    const store = getOrCreateResource(instance, comlinkControllerStore)

    // Reset store state
    store.state.set('test reset', {
      controller: null,
      channels: new Map(),
    })
    vi.clearAllMocks()
  })

  it('should create a new controller if none exists', () => {
    const controllerSpy = vi.spyOn(comlink, 'createController')
    const targetOrigin = 'https://test.sanity.dev'

    const controller = getOrCreateController(instance, targetOrigin)

    expect(controllerSpy).toHaveBeenCalledWith({targetOrigin})
    expect(controller).toBeDefined()
    expect(controller!.destroy).toBeDefined() // Verify it's a real controller
  })

  it('should return existing controller if one exists', () => {
    const controllerSpy = vi.spyOn(comlink, 'createController')
    const targetOrigin = 'https://test.sanity.dev'

    const firstController = getOrCreateController(instance, targetOrigin)
    const secondController = getOrCreateController(instance, targetOrigin)

    expect(controllerSpy).toHaveBeenCalledTimes(1)
    expect(firstController).toBe(secondController)
  })
})

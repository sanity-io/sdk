import * as comlink from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {createController} from './createController'

vi.mock('@sanity/comlink', () => {
  return {
    createController: vi.fn(() => ({
      addTarget: vi.fn(),
      createChannel: vi.fn(),
      destroy: vi.fn(),
    })),
  }
})

describe('createController', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should create a new controller if none exists', () => {
    const controllerSpy = vi.spyOn(comlink, 'createController')
    const targetOrigin = 'https://test.sanity.dev'

    const controller = createController(instance, targetOrigin)

    expect(controllerSpy).toHaveBeenCalledWith({targetOrigin})
    expect(controller).toBeDefined()
    expect(controller!.destroy).toBeDefined() // Verify it's a real controller
  })
})

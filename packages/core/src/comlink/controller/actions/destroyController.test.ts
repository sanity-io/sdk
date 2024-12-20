import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkControllerStore} from '../comlinkControllerStore'
import {destroyController} from './destroyController'
import {getOrCreateController} from './getOrCreateController'

describe('destroyController', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should destroy controller and clear state', () => {
    const controller = getOrCreateController(instance, 'https://test.sanity.dev')!
    const destroySpy = vi.spyOn(controller, 'destroy')

    destroyController(instance)

    expect(destroySpy).toHaveBeenCalled()

    const store = getOrCreateResource(instance, comlinkControllerStore)
    const state = store.state.get()
    expect(state.controller).toBeNull()
    expect(state.channels.size).toBe(0)
  })

  it('should do nothing if no controller exists', () => {
    expect(() => destroyController(instance)).not.toThrow()
  })
})

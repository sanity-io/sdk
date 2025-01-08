import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {createResourceState} from '../../../resources/createResource'
import {comlinkControllerStore} from '../comlinkControllerStore'
import {destroyController} from './destroyController'
import {getOrCreateController} from './getOrCreateController'

describe('destroyController', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('should destroy controller and clear state', () => {
    const state = createResourceState(comlinkControllerStore.getInitialState(instance))
    getOrCreateController(instance, 'https://test.sanity.dev')!
    destroyController({state, instance})

    expect(state.get().controller).toBeNull()
    expect(state.get().channels.size).toBe(0)
  })

  it('should do nothing if no controller exists', () => {
    const state = createResourceState(comlinkControllerStore.getInitialState(instance))

    expect(() => destroyController({state, instance})).not.toThrow()
  })
})

import type {Controller} from '@sanity/comlink'
import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {createController} from './createController'
import {getControllerState} from './getControllerState'

describe('getControllerState', () => {
  let instance: SanityInstance
  let controller: Controller

  beforeEach(() => {
    instance = createSanityInstance(config)
    controller = createController(instance, 'https://test.sanity.dev')
  })

  it('should retrieve controller directly from store once created', () => {
    const {getCurrent} = getControllerState(instance)
    const retrievedController = getCurrent()
    expect(retrievedController).toBeDefined()
    expect(retrievedController).toBe(controller)
  })
})

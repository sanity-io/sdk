import type {Controller} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkControllerStore} from '../comlinkControllerStore'
import {createChannel} from './createChannel'
import {createController} from './createController'

const channelConfig = {
  name: 'test',
  connectTo: 'iframe',
}

describe('createChannel', () => {
  let instance: SanityInstance
  let controller: Controller

  beforeEach(() => {
    instance = createSanityInstance(config)
    controller = createController(instance, 'https://test.sanity.dev')!
    vi.clearAllMocks()
  })

  it('should create a new channel using the controller', () => {
    const createChannelSpy = vi.spyOn(controller, 'createChannel')

    const channel = createChannel(instance, channelConfig)

    expect(createChannelSpy).toHaveBeenCalledWith(channelConfig)
    expect(channel.on).toBeDefined()
    expect(channel.post).toBeDefined()
    const store = getOrCreateResource(instance, comlinkControllerStore)
    expect(store.state.get().channels.get('test')).toBe(channel)
  })

  it('should throw error when controller is not initialized', () => {
    const store = getOrCreateResource(instance, comlinkControllerStore)

    store.state.set('test reset', {
      controller: null,
      channels: new Map(),
    })

    expect(() => createChannel(instance, channelConfig)).toThrow(
      'Controller must be initialized before creating channels',
    )
  })
})

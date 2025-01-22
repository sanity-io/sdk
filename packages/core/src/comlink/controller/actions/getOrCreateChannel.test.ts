import {type Controller} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import {type SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkControllerStore} from '../comlinkControllerStore'
import {getOrCreateChannel} from './getOrCreateChannel'
import {getOrCreateController} from './getOrCreateController'

const channelConfig = {
  name: 'test',
  connectTo: 'iframe',
}

describe('createChannel', () => {
  let instance: SanityInstance
  let controller: Controller

  beforeEach(() => {
    instance = createSanityInstance(config)
    controller = getOrCreateController(instance, 'https://test.sanity.dev')!
    vi.clearAllMocks()
  })

  it('should create a new channel using the controller', () => {
    const createChannelSpy = vi.spyOn(controller, 'createChannel')

    const channel = getOrCreateChannel(instance, channelConfig)

    expect(createChannelSpy).toHaveBeenCalledWith(channelConfig)
    expect(channel.on).toBeDefined()
    expect(channel.post).toBeDefined()
    const store = getOrCreateResource(instance, comlinkControllerStore)
    expect(store.state.get().channels.get('test')).toStrictEqual(
      expect.objectContaining({
        channel,
        options: channelConfig,
      }),
    )
  })

  it('should throw error when controller is not initialized', () => {
    const store = getOrCreateResource(instance, comlinkControllerStore)

    store.state.set('test reset', {
      controller: null,
      channels: new Map(),
    })

    expect(() => getOrCreateChannel(instance, channelConfig)).toThrow(
      'Controller must be initialized before using or creating channels',
    )
  })

  it('should retrieve channel directly from store once created', () => {
    const createdChannel = getOrCreateChannel(instance, channelConfig)

    const retrievedChannel = getOrCreateChannel(instance, channelConfig)
    expect(retrievedChannel).toBeDefined()
    expect(retrievedChannel).toBe(createdChannel)
  })

  it('should throw error when trying to create channel with different options', () => {
    getOrCreateChannel(instance, channelConfig)

    expect(() =>
      getOrCreateChannel(instance, {
        ...channelConfig,
        connectTo: 'window',
      }),
    ).toThrow('Channel "test" already exists with different options')
  })
})

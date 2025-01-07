import type {ChannelInstance} from '@sanity/comlink'
import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import type {FrameMessage, WindowMessage} from '../../types'
import {createChannel} from './createChannel'
import {createController} from './createController'
import {getChannelState} from './getChannelState'

const channelConfig = {
  name: 'test',
  connectTo: 'iframe',
}

describe('getChannelState', () => {
  let instance: SanityInstance
  let createdChannel: ChannelInstance<FrameMessage, WindowMessage>

  beforeEach(() => {
    instance = createSanityInstance(config)
    createController(instance, 'https://test.sanity.dev')
    createdChannel = createChannel(instance, channelConfig)!
  })

  it('should retrieve channel directly from store once created', () => {
    const {getCurrent} = getChannelState(instance, channelConfig.name)
    const retrievedChannel = getCurrent()
    expect(retrievedChannel).toBe(createdChannel)
  })
})

import {type ChannelInstance, type Controller} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../../store/createSanityInstance'
import {createStoreState} from '../../../store/createStoreState'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ChannelEntry, type ComlinkControllerState} from '../comlinkControllerStore'
import {getOrCreateChannel} from './getOrCreateChannel'

const channelConfig = {
  name: 'test',
  connectTo: 'iframe',
}

describe('getOrCreateChannel', () => {
  const instance = createSanityInstance({
    projectId: 'test-project-id',
    dataset: 'test-dataset',
  })
  let state: ReturnType<typeof createStoreState<ComlinkControllerState>>
  let mockController: Partial<Controller>
  let mockChannel: Partial<ChannelInstance<FrameMessage, WindowMessage>>

  beforeEach(() => {
    // Set up mock channel that we can spy on
    mockChannel = {
      start: vi.fn(),
      stop: vi.fn(),
      on: vi.fn(),
      post: vi.fn(),
    }

    // Set up mock controller that returns our mock channel
    mockController = {
      createChannel: vi.fn(() => mockChannel as ChannelInstance<FrameMessage, WindowMessage>),
      destroy: vi.fn(),
    }

    // Initialize fresh test store state with a mock controller
    state = createStoreState<ComlinkControllerState>({
      controller: mockController as Controller,
      controllerOrigin: 'https://test.sanity.dev',
      channels: new Map(),
    })

    vi.clearAllMocks()
  })

  it('should create a new channel using the controller', () => {
    const createChannelSpy = vi.spyOn(mockController, 'createChannel')

    const channel = getOrCreateChannel({state, instance}, channelConfig)

    expect(createChannelSpy).toHaveBeenCalledWith(channelConfig)
    expect(channel.on).toBeDefined()
    expect(channel.post).toBeDefined()
    expect(state.get().channels.get('test')).toStrictEqual(
      expect.objectContaining({
        channel,
        options: channelConfig,
      }),
    )
  })

  it('should throw error when controller is not initialized', () => {
    // Reset state to have no controller
    state.set('reset', {
      controller: null,
      controllerOrigin: null,
      channels: new Map(),
    })

    expect(() => getOrCreateChannel({state, instance}, channelConfig)).toThrow(
      'Controller must be initialized before using or creating channels',
    )
  })

  it('should retrieve channel directly from store once created', () => {
    const createdChannel = getOrCreateChannel({state, instance}, channelConfig)
    vi.clearAllMocks() // Clear call counts

    // Retrieve channel again
    const retrievedChannel = getOrCreateChannel({state, instance}, channelConfig)
    expect(retrievedChannel).toBeDefined()
    expect(retrievedChannel).toBe(createdChannel)

    // Should increment refCount
    const channelEntry = state.get().channels.get('test') as ChannelEntry
    expect(channelEntry.refCount).toBe(2)

    // Start should be called again
    expect(mockChannel.start).toHaveBeenCalled()
    // But createChannel should not be called again
    expect(mockController.createChannel).not.toHaveBeenCalled()
  })

  it('should throw error when trying to create channel with different options', () => {
    getOrCreateChannel({state, instance}, channelConfig)

    expect(() =>
      getOrCreateChannel({state, instance}, {...channelConfig, connectTo: 'window'}),
    ).toThrow('Channel "test" already exists with different options')
  })
})

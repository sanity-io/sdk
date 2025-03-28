import {type ChannelInput, type ChannelInstance, type Controller} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {type StoreAction} from '../../../store/createActionBinder'
import {createSanityInstance, type SanityInstance} from '../../../store/createSanityInstance'
import {} from '../../../store/createStateSourceAction'
import {createStoreInstance, type StoreInstance} from '../../../store/createStoreInstance'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ComlinkControllerState, comlinkControllerStore} from '../comlinkControllerStore'
import {getOrCreateChannel as unboundGetOrCreateChannel} from './getOrCreateChannel'
import {getOrCreateController as unboundGetOrCreateController} from './getOrCreateController'
import {releaseChannel as unboundReleaseChannel} from './releaseChannel'

const channelConfig = {
  name: 'test',
  connectTo: 'iframe',
}

describe('releaseChannel', () => {
  let instance: SanityInstance
  let store: StoreInstance<ComlinkControllerState>

  let getOrCreateChannel: (
    inst: SanityInstance,
    options: ChannelInput,
  ) => ChannelInstance<FrameMessage, WindowMessage>
  let getOrCreateController: (inst: SanityInstance, targetOrigin: string) => Controller
  let releaseChannel: (inst: SanityInstance, channelName: string) => void

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test-project-id', dataset: 'test-dataset'})
    store = createStoreInstance(instance, comlinkControllerStore)

    const bind =
      <TParams extends unknown[], TReturn>(
        action: StoreAction<ComlinkControllerState, TParams, TReturn>,
      ) =>
      (inst: SanityInstance, ...params: TParams) =>
        action({instance: inst, state: store.state}, ...params)

    getOrCreateChannel = bind(unboundGetOrCreateChannel)
    getOrCreateController = bind(unboundGetOrCreateController)
    releaseChannel = bind(unboundReleaseChannel)

    getOrCreateController(instance, 'https://test.sanity.dev')!
    vi.clearAllMocks()
  })

  afterEach(() => {
    instance.dispose()
    store.dispose()
  })

  it('should remove channel when released', () => {
    // Create a channel
    getOrCreateChannel(instance, channelConfig)

    // Get store state
    expect(store.state.get().channels.has('test')).toBe(true)

    // Release the channel
    releaseChannel(instance, 'test')

    // Check channel is removed
    expect(store.state.get().channels.has('test')).toBe(false)
  })

  it('should stop the channel when released', () => {
    // Create a channel
    const channel = getOrCreateChannel(instance, channelConfig)
    const stopSpy = vi.spyOn(channel, 'stop')

    // Release the channel
    releaseChannel(instance, 'test')

    // Verify channel was stopped
    expect(stopSpy).toHaveBeenCalled()
  })

  it('should stop the channel when refCount reaches 0', () => {
    // Create a channel
    const channel = getOrCreateChannel(instance, channelConfig)
    const stopSpy = vi.spyOn(channel, 'stop')

    // Release the channel
    releaseChannel(instance, 'test')

    // Verify channel was stopped
    expect(stopSpy).toHaveBeenCalled()
  })

  it('should not stop the channel if refCount is still above 0', () => {
    // Create a channel twice to increment refCount
    const channel = getOrCreateChannel(instance, channelConfig)
    getOrCreateChannel(instance, channelConfig)
    const stopSpy = vi.spyOn(channel, 'stop')

    // Release once
    releaseChannel(instance, 'test')

    // Channel should not be stopped
    expect(stopSpy).not.toHaveBeenCalled()

    // Verify refCount is 1
    const channelEntry = store.state.get().channels.get('test')
    expect(channelEntry?.refCount).toBe(1)
  })

  it('should handle multiple releases gracefully', () => {
    // Create a channel
    getOrCreateChannel(instance, channelConfig)

    // Release multiple times
    releaseChannel(instance, 'test')
    releaseChannel(instance, 'test')
    releaseChannel(instance, 'test')

    expect(store.state.get().channels.has('test')).toBe(false)
  })

  it('should handle releasing non-existent channels', () => {
    // Should not throw when releasing non-existent channel
    expect(() => releaseChannel(instance, 'non-existent')).not.toThrow()
  })

  it('should maintain correct state after complex operations', () => {
    // Create channel multiple times
    const channel = getOrCreateChannel(instance, channelConfig)
    getOrCreateChannel(instance, channelConfig)
    getOrCreateChannel(instance, channelConfig)

    let channelEntry = store.state.get().channels.get('test')

    // Initial refCount should be 3
    expect(channelEntry?.refCount).toBe(3)

    // Release twice
    releaseChannel(instance, 'test')
    releaseChannel(instance, 'test')

    channelEntry = store.state.get().channels.get('test')
    expect(channelEntry?.refCount).toBe(1)

    // Verify channel hasn't been stopped yet
    const stopSpy = vi.spyOn(channel, 'stop')
    expect(stopSpy).not.toHaveBeenCalled()

    // Release final reference
    releaseChannel(instance, 'test')

    // Verify channel was stopped
    expect(stopSpy).toHaveBeenCalled()

    expect(store.state.get().channels.has('test')).toBe(false)
  })
})

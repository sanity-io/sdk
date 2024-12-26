import type {ChannelInstance, Controller} from '@sanity/comlink'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useFrameConnection} from './useFrameConnection'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getChannelSource: vi.fn(),
    getControllerSource: vi.fn(),
    initializeController: vi.fn(),
    createChannel: vi.fn(),
  }
})

const {getChannelSource, getControllerSource} = await import('@sanity/sdk')

interface TestControllerMessage {
  type: 'TEST_MESSAGE'
  data: {
    someData: string
  }
}

interface TestNodeMessage {
  type: 'NODE_MESSAGE'
  data: {
    someData: string
  }
}

function createMockChannel() {
  return {
    on: vi.fn(),
    post: vi.fn(),
    stop: vi.fn(),
  } as unknown as ChannelInstance<TestControllerMessage, TestNodeMessage>
}

function createMockSource<T>(mockCurrentValue: T, triggerableCallback: (() => void) | null) {
  return {
    getCurrent: vi.fn().mockReturnValue(mockCurrentValue),
    subscribe: vi.fn((callback: () => void) => {
      if (triggerableCallback) {
        triggerableCallback = callback
      }
      return () => {
        triggerableCallback = null
      }
    }),
    observable: of(mockCurrentValue),
  }
}

describe('useFrameController', () => {
  let channel: ChannelInstance<TestControllerMessage, TestNodeMessage>
  let controller: Controller

  let channelSubscriber: (() => void) | null
  let controllerSubscriber: (() => void) | null

  beforeEach(() => {
    channelSubscriber = null
    controllerSubscriber = null

    channel = createMockChannel()
    controller = {
      addTarget: vi.fn(),
      destroy: vi.fn(),
    } as unknown as Controller

    vi.mocked(getChannelSource).mockReturnValue(createMockSource(channel, channelSubscriber))

    vi.mocked(getControllerSource).mockReturnValue(
      createMockSource(controller, controllerSubscriber),
    )
  })

  it('should register and execute message handlers', () => {
    const mockHandler = vi.fn()
    const mockData = {someData: 'test'}

    renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
        onMessage: {
          TEST_MESSAGE: mockHandler,
        },
      }),
    )

    // Get the callback that was passed to channel.on (in comlink)
    const onCallback = vi.mocked(channel.on).mock.calls[0][1]

    onCallback(mockData)

    expect(mockHandler).toHaveBeenCalledWith(mockData)
  })

  it('should handle connecting frames', () => {
    const {result} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    const mockWindow = {} as Window
    result.current.connect(mockWindow)

    expect(controller.addTarget).toHaveBeenCalledWith(mockWindow)
  })

  it('should handle channel updates from source functions from core', async () => {
    const initialChannel = createMockChannel()
    const newChannel = createMockChannel()
    let subscriberCallback: () => void

    // Create a mockGetCurrent that we can update
    const mockGetCurrent = vi.fn().mockReturnValue(initialChannel)

    // Setup initial state source
    vi.mocked(getChannelSource).mockReturnValue({
      getCurrent: mockGetCurrent,
      subscribe: vi.fn((callback) => {
        subscriberCallback = callback
        return () => {}
      }),
      observable: of(initialChannel),
    })

    const {result} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    const mockMessage = {type: 'TEST_MESSAGE', data: {someData: 'data'}}
    result.current.sendMessage(mockMessage.type, mockMessage.data)
    expect(initialChannel.post).toHaveBeenCalledWith(mockMessage.type, mockMessage.data)

    // Update what getCurrent will return
    mockGetCurrent.mockReturnValue(newChannel)

    // Trigger subscription update so useSyncExternalStore calls getCurrent again
    await act(async () => {
      subscriberCallback()
    })

    // Test message sending with updated channel
    result.current.sendMessage(mockMessage.type, mockMessage.data)
    expect(newChannel.post).toHaveBeenCalledWith(mockMessage.type, mockMessage.data)
  })

  it('should unsubscribe on unmount', () => {
    const unsubscribeChannel = vi.fn()
    const unsubscribeController = vi.fn()

    vi.mocked(getChannelSource).mockReturnValue({
      getCurrent: vi.fn().mockReturnValue(channel),
      subscribe: vi.fn(() => unsubscribeChannel),
      observable: of(channel),
    })

    vi.mocked(getControllerSource).mockReturnValue({
      getCurrent: vi.fn().mockReturnValue(controller),
      subscribe: vi.fn(() => unsubscribeController),
      observable: of(controller),
    })

    const {unmount} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    unmount()

    expect(unsubscribeChannel).toHaveBeenCalled()
    expect(unsubscribeController).toHaveBeenCalled()
  })
})

import {type ChannelInstance, type Controller, type Status} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useFrameConnection} from './useFrameConnection'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOrCreateChannel: vi.fn(),
    getOrCreateController: vi.fn(),
    releaseChannel: vi.fn(),
  }
})

const {getOrCreateChannel, getOrCreateController, releaseChannel} = await import('@sanity/sdk')

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

describe('useFrameController', () => {
  let channel: ChannelInstance<TestControllerMessage, TestNodeMessage>
  let controller: Controller
  let removeTargetMock: ReturnType<typeof vi.fn>
  let statusCallback:
    | (({status, connection}: {status: Status; connection: string}) => void)
    | null = null

  function createMockChannel() {
    return {
      on: vi.fn(() => () => {}),
      post: vi.fn(),
      stop: vi.fn(),
      onStatus: vi.fn((callback) => {
        statusCallback = callback
        return () => {}
      }),
    } as unknown as ChannelInstance<TestControllerMessage, TestNodeMessage>
  }

  beforeEach(() => {
    channel = createMockChannel()
    removeTargetMock = vi.fn()
    controller = {
      addTarget: vi.fn(() => removeTargetMock),
      destroy: vi.fn(),
    } as unknown as Controller
    vi.mocked(getOrCreateChannel).mockReturnValue(channel)
    vi.mocked(getOrCreateController).mockReturnValue(controller)
  })

  it('should initialize with idle status', () => {
    const {result} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    expect(result.current.status).toBe('idle')
  })

  it('should update status to connected when node connects', async () => {
    const {result} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    expect(result.current.status).toBe('idle')
    act(() => {
      statusCallback?.({status: 'connected', connection: 'test'})
    })
    expect(result.current.status).toBe('connected')
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

    const onCallback = vi.mocked(channel.on).mock.calls[0][1]
    onCallback(mockData)
    expect(mockHandler).toHaveBeenCalledWith(mockData)
  })

  it('should handle connecting frames and cleanup on disconnect', () => {
    const {result} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    const mockWindow = {} as Window
    const cleanup = result.current.connect(mockWindow)

    expect(controller.addTarget).toHaveBeenCalledWith(mockWindow)

    // Test cleanup
    cleanup()
    expect(removeTargetMock).toHaveBeenCalled()
  })

  it('should send messages correctly', () => {
    const {result} = renderHook(() =>
      useFrameConnection<TestControllerMessage, TestNodeMessage>({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    const mockData = {someData: 'test'}
    result.current.sendMessage('TEST_MESSAGE', mockData)

    expect(channel.post).toHaveBeenCalledWith('TEST_MESSAGE', mockData)
  })

  it('should cleanup on unmount', () => {
    const {unmount} = renderHook(() =>
      useFrameConnection({
        name: 'test',
        connectTo: 'iframe',
        targetOrigin: '*',
      }),
    )

    unmount()
    expect(releaseChannel).toHaveBeenCalled()
  })
})

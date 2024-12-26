import {type Message, type Node} from '@sanity/comlink'
import {getNodeSource} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useWindowConnection} from './useWindowConnection'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getNodeSource: vi.fn(),
  }
})

interface TestMessage {
  type: 'TEST_MESSAGE'
  data: {someData: string}
}

interface AnotherMessage {
  type: 'ANOTHER_MESSAGE'
  data: {otherData: number}
}

type TestMessages = TestMessage | AnotherMessage

function createMockNode() {
  return {
    on: vi.fn(),
    post: vi.fn(),
    stop: vi.fn(),
  } as unknown as Node<TestMessages, Message>
}

describe('useWindowConnection', () => {
  let node: Node<TestMessages, Message>
  let _nodeSubscriber: (() => void) | null

  beforeEach(() => {
    _nodeSubscriber = null
    node = createMockNode()

    vi.mocked(getNodeSource).mockReturnValue({
      getCurrent: vi.fn().mockReturnValue(node),
      subscribe: vi.fn((callback) => {
        _nodeSubscriber = callback
        return () => {
          _nodeSubscriber = null
        }
      }),
      // @ts-expect-error -- just for mocking at the moment
      observable: vi.fn(),
    })
  })

  it('should register message handlers', () => {
    const mockHandler = vi.fn()
    const mockData = {someData: 'test'}

    renderHook(() =>
      useWindowConnection<TestMessages>({
        name: 'test',
        connectTo: 'window',
        onMessage: {
          TEST_MESSAGE: mockHandler,
          ANOTHER_MESSAGE: vi.fn(),
        },
      }),
    )

    const onCallback = vi.mocked(node.on).mock.calls[0][1]
    onCallback(mockData)

    expect(mockHandler).toHaveBeenCalledWith(mockData)
  })

  it('should send messages through the node', () => {
    const {result} = renderHook(() =>
      useWindowConnection<TestMessages>({
        name: 'test',
        connectTo: 'window',
      }),
    )

    result.current.sendMessage('TEST_MESSAGE', {someData: 'test'})
    expect(node.post).toHaveBeenCalledWith('TEST_MESSAGE', {someData: 'test'})

    result.current.sendMessage('ANOTHER_MESSAGE', {otherData: 123})
    expect(node.post).toHaveBeenCalledWith('ANOTHER_MESSAGE', {otherData: 123})
  })

  it('should cleanup message handlers on unmount', () => {
    const unsubscribe = vi.fn()

    vi.mocked(getNodeSource).mockReturnValue({
      getCurrent: vi.fn().mockReturnValue(node),
      subscribe: vi.fn(() => unsubscribe),
      // @ts-expect-error -- just for mocking at the moment
      observable: vi.fn(),
    })

    const {unmount} = renderHook(() =>
      useWindowConnection<TestMessages>({
        name: 'test',
        connectTo: 'window',
      }),
    )

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

import {type Message, type Node} from '@sanity/comlink'
import {getOrCreateNode, releaseNode} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useWindowConnection} from './useWindowConnection'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOrCreateNode: vi.fn(),
    createNode: vi.fn(),
    releaseNode: vi.fn(),
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
    // return unsubscribe function
    on: vi.fn(() => () => {}),
    post: vi.fn(),
    stop: vi.fn(),
  } as unknown as Node<Message, Message>
}

describe('useWindowConnection', () => {
  let node: Node<Message, Message>

  beforeEach(() => {
    node = createMockNode()

    vi.mocked(getOrCreateNode).mockReturnValue(node as unknown as Node<Message, Message>)
  })

  it('should register message handlers', () => {
    const mockHandler = vi.fn()
    const mockData = {someData: 'test'}

    renderHook(() =>
      useWindowConnection<TestMessages, TestMessages>({
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
      useWindowConnection<TestMessages, TestMessages>({
        name: 'test',
        connectTo: 'window',
      }),
    )

    result.current.sendMessage('TEST_MESSAGE', {someData: 'test'})
    expect(node.post).toHaveBeenCalledWith('TEST_MESSAGE', {someData: 'test'})

    result.current.sendMessage('ANOTHER_MESSAGE', {otherData: 123})
    expect(node.post).toHaveBeenCalledWith('ANOTHER_MESSAGE', {otherData: 123})
  })

  it('should cleanup on unmount', () => {
    const {unmount} = renderHook(() =>
      useWindowConnection<TestMessages, TestMessages>({
        name: 'test',
        connectTo: 'window',
      }),
    )

    unmount()
    expect(releaseNode).toHaveBeenCalled()
  })
})

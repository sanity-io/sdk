import {type Message, type Node} from '@sanity/comlink'
import {getNodeState, type NodeState, type StateSource} from '@sanity/sdk'
import {screen} from '@testing-library/react'
import {Suspense} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {render, renderHook} from '../../../test/test-utils'
import {useWindowConnection} from './useWindowConnection'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getNodeState: vi.fn(),
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

describe('useWindowConnection', () => {
  let node: Node<Message, Message>
  let mockStateSource: StateSource<NodeState>
  let stableNodeEntry: NodeState

  function createMockNode() {
    return {
      on: vi.fn(() => () => {}),
      post: vi.fn(),
      stop: vi.fn(),
    } as unknown as Node<Message, Message>
  }

  beforeEach(() => {
    node = createMockNode()
    stableNodeEntry = {node, status: 'connected'}
    mockStateSource = {
      subscribe: vi.fn((callback) => {
        callback?.(stableNodeEntry)
        return () => {}
      }),
      getCurrent: vi.fn(() => stableNodeEntry),
      observable: {subscribe: vi.fn(() => ({unsubscribe: () => {}}))},
    } as unknown as StateSource<NodeState>
    vi.mocked(getNodeState).mockReturnValue(mockStateSource)
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

  it('should suspend and render fallback when node state is undefined', () => {
    const suspenderPromise = Promise.resolve('resolved')
    const mockStateSourceWithUndefined = {
      subscribe: vi.fn(),
      getCurrent: vi.fn(() => undefined),
      observable: {
        pipe: vi.fn(() => ({
          subscribe: vi.fn(() => ({unsubscribe: () => {}})),
          toPromise: () => suspenderPromise,
        })),
        subscribe: vi.fn(() => ({unsubscribe: () => {}})),
      },
    } as unknown as StateSource<NodeState>

    vi.mocked(getNodeState).mockReturnValue(mockStateSourceWithUndefined)

    function TestComponent() {
      useWindowConnection<TestMessages, TestMessages>({
        name: 'test',
        connectTo: 'window',
      })
      return <div>Loaded</div>
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should call node.fetch with correct arguments and return its result', async () => {
    const mockFetch = vi.fn().mockResolvedValue('fetch-result')
    node.fetch = mockFetch

    const {result} = renderHook(() =>
      useWindowConnection<TestMessages, TestMessages>({
        name: 'test',
        connectTo: 'window',
      }),
    )

    const response = await result.current.fetch('TYPE', {foo: 'bar'}, {responseTimeout: 123})
    expect(mockFetch).toHaveBeenCalledWith('TYPE', {foo: 'bar'}, {responseTimeout: 123})
    expect(response).toBe('fetch-result')

    const responseNoArgs = await result.current.fetch('TYPE')
    expect(mockFetch).toHaveBeenCalledWith('TYPE', undefined, {})
    expect(responseNoArgs).toBe('fetch-result')
  })
})

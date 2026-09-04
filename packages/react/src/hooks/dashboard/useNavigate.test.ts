import {type Message, type Node} from '@sanity/comlink'
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type StateSource} from '@sanity/sdk'
import {getNodeState, type NodeState} from '@sanity/sdk/comlink'
import {act, renderHook} from '@testing-library/react'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {useNavigate} from './useNavigate'

const mocks = vi.hoisted(() => ({
  instance: {config: {}},
  messageBus: undefined as MessageBus | undefined,
}))

vi.mock('@sanity/sdk/comlink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/sdk/comlink')>()),
  getNodeState: vi.fn(),
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.messageBus,
}))

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => mocks.instance,
}))

describe('useNavigate', () => {
  let node: Node<Message, Message>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.messageBus = undefined
    node = {
      on: vi.fn(() => () => {}),
      post: vi.fn(),
      stop: vi.fn(),
    } as unknown as Node<Message, Message>
    const state = {node, status: 'connected'} as unknown as NodeState
    vi.mocked(getNodeState).mockReturnValue({
      getCurrent: () => state,
      observable: of(state),
      subscribe: () => () => {},
    } as StateSource<NodeState | undefined>)
  })

  it('receives navigation through Comlink inside an embedded application', () => {
    const navigate = vi.fn()
    renderHook(() => useNavigate(navigate))

    const change = {path: '/test-path', type: 'push'} as const
    const messageHandler = vi.mocked(node.on).mock.calls[0][1]
    messageHandler(change)

    expect(navigate).toHaveBeenCalledWith(change)
    expect(getNodeState).toHaveBeenCalledWith(mocks.instance, {
      name: SDK_NODE_NAME,
      connectTo: SDK_CHANNEL_NAME,
    })
  })

  it('follows navigation for the foreground federated application', () => {
    const navigate = vi.fn()
    mocks.messageBus = createIsolatedMessageBus('application')
    mocks.messageBus.emit('applications.foreground', 'application')
    mocks.messageBus.emit('navigation.location', {
      appId: 'application',
      path: 'initial',
      transition: null,
    })

    renderHook(() => useNavigate(navigate))

    expect(navigate).toHaveBeenLastCalledWith({path: 'initial', type: 'pop'})
    expect(getNodeState).not.toHaveBeenCalled()

    act(() =>
      mocks.messageBus?.emit('navigation.location', {
        appId: 'application',
        path: 'initial',
        transition: {
          navigationType: 'replace',
          to: {appId: 'application', path: 'next'},
        },
      }),
    )

    expect(navigate).toHaveBeenLastCalledWith({path: 'next', type: 'replace'})

    act(() =>
      mocks.messageBus?.emit('navigation.location', {
        appId: 'application',
        path: 'next',
        transition: null,
      }),
    )

    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('ignores navigation for another application', () => {
    const navigate = vi.fn()
    mocks.messageBus = createIsolatedMessageBus('application')
    mocks.messageBus.emit('applications.foreground', 'application')
    mocks.messageBus.emit('navigation.location', {
      appId: 'other-application',
      path: 'somewhere',
      transition: null,
    })

    renderHook(() => useNavigate(navigate))

    expect(navigate).not.toHaveBeenCalled()
  })
})

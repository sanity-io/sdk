import * as comlink from '@sanity/comlink'
import {type Node} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../../store/createSanityInstance'
import {createStoreState} from '../../../store/createStoreState'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ComlinkNodeState} from '../comlinkNodeStore'
import {getOrCreateNode} from './getOrCreateNode'

vi.mock('@sanity/comlink', () => ({
  createNode: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    onStatus: vi.fn(),
  })),
}))

const nodeConfig = {
  name: 'test-node',
  connectTo: 'parent',
}

describe('getOrCreateNode', () => {
  const instance = createSanityInstance({
    projectId: 'test-project-id',
    dataset: 'test-dataset',
  })
  let state: ReturnType<typeof createStoreState<ComlinkNodeState>>
  let mockNode: Partial<Node<WindowMessage, FrameMessage>> & {
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockNode = {start: vi.fn(), stop: vi.fn(), onStatus: vi.fn()}
    vi.mocked(comlink.createNode).mockReturnValue(mockNode as Node<WindowMessage, FrameMessage>)
    state = createStoreState<ComlinkNodeState>({nodes: new Map(), subscriptions: new Map()})
    vi.clearAllMocks()
  })

  it('should create and start a node', () => {
    const node = getOrCreateNode({state, instance}, nodeConfig)

    expect(comlink.createNode).toHaveBeenCalledWith(nodeConfig)
    expect(node.start).toHaveBeenCalled()
  })

  it('should store the node in nodeStore', () => {
    const node = getOrCreateNode({state, instance}, nodeConfig)

    expect(getOrCreateNode({state, instance}, nodeConfig)).toBe(node)
  })

  it('should throw error when trying to create node with different options', () => {
    getOrCreateNode({state, instance}, nodeConfig)

    expect(() =>
      getOrCreateNode(
        {state, instance},
        {
          ...nodeConfig,
          connectTo: 'window',
        },
      ),
    ).toThrow('Node "test-node" already exists with different options')
  })

  it('should subscribe to status changes and update state', () => {
    let statusCallback: ((status: string) => void) | undefined
    const statusUnsubMock = vi.fn()
    mockNode.onStatus = vi.fn((cb) => {
      statusCallback = cb
      return statusUnsubMock
    })

    getOrCreateNode({state, instance}, nodeConfig)

    expect(mockNode.onStatus).toHaveBeenCalled()
    expect(state.get().nodes.get(nodeConfig.name)?.statusUnsub).toBe(statusUnsubMock)

    statusCallback?.('connected')

    expect(state.get().nodes.get(nodeConfig.name)?.status).toBe('connected')
  })

  it('should not update state if node entry is missing when status changes', () => {
    let statusCallback: ((status: string) => void) | undefined
    const statusUnsubMock = vi.fn()
    mockNode.onStatus = vi.fn((cb) => {
      statusCallback = cb
      return statusUnsubMock
    })

    getOrCreateNode({state, instance}, nodeConfig)

    // Remove the node entry before triggering the status callback
    state.get().nodes.delete(nodeConfig.name)

    // Simulate a status change
    statusCallback?.('connected')

    // Assert: node entry is still missing, so no update occurred
    expect(state.get().nodes.has(nodeConfig.name)).toBe(false)
  })
})

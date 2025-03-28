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
    mockNode = {start: vi.fn(), stop: vi.fn()}
    vi.mocked(comlink.createNode).mockReturnValue(mockNode as Node<WindowMessage, FrameMessage>)
    state = createStoreState<ComlinkNodeState>({nodes: new Map()})
    vi.clearAllMocks()
  })

  it('should create and start a node', () => {
    const node = getOrCreateNode({state, instance}, nodeConfig)

    expect(comlink.createNode).toHaveBeenCalledWith(nodeConfig)
    expect(node.start).toHaveBeenCalled()
  })

  it('sshould store the node in nodeStore', () => {
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
})

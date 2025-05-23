import {type Node} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../../../store/createSanityInstance'
import {createStoreState} from '../../../store/createStoreState'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ComlinkNodeState} from '../comlinkNodeStore'
import {releaseNode} from './releaseNode'

const nodeConfig = {
  name: 'test-node',
  connectTo: 'parent',
}

describe('releaseNode', () => {
  let instance: SanityInstance
  let state: ReturnType<typeof createStoreState<ComlinkNodeState>>
  let mockNode: Partial<Node<WindowMessage, FrameMessage>> & {
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    onStatus: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    instance = createSanityInstance({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    })
    mockNode = {start: vi.fn(), stop: vi.fn(), onStatus: vi.fn()}
    state = createStoreState<ComlinkNodeState>({nodes: new Map(), subscriptions: new Map()})
    vi.clearAllMocks()
  })

  afterEach(() => {
    instance.dispose()
  })

  it('should stop and remove node when released', () => {
    // Set up a node in the state
    const nodes = new Map()
    nodes.set('test-node', {
      node: mockNode as Node<WindowMessage, FrameMessage>,
      options: nodeConfig,
    })
    state.set('setup', {nodes})

    expect(state.get().nodes.has('test-node')).toBe(true)

    // Release the node
    releaseNode({state, instance}, 'test-node')

    // Check node is removed
    expect(mockNode.stop).toHaveBeenCalled()
    expect(state.get().nodes.has('test-node')).toBe(false)
  })

  it('should call statusUnsub if present when releasing node', () => {
    const statusUnsub = vi.fn()
    const nodes = new Map()
    nodes.set('test-node', {
      node: mockNode as Node<WindowMessage, FrameMessage>,
      options: nodeConfig,
      statusUnsub,
    })
    state.set('setup', {nodes})

    releaseNode({state, instance}, 'test-node')

    expect(statusUnsub).toHaveBeenCalled()
  })
})

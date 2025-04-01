import {type Node} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../../../store/createSanityInstance'
import {createStoreState} from '../../../store/createStoreState'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ComlinkNodeState, type NodeEntry} from '../comlinkNodeStore'
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
  }

  beforeEach(() => {
    instance = createSanityInstance({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    })
    mockNode = {start: vi.fn(), stop: vi.fn()}
    state = createStoreState<ComlinkNodeState>({nodes: new Map()})
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
      refCount: 1,
    })
    state.set('setup', {nodes})

    expect(state.get().nodes.has('test-node')).toBe(true)

    // Release the node
    releaseNode({state, instance}, 'test-node')

    // Check node is removed
    expect(mockNode.stop).toHaveBeenCalled()
    expect(state.get().nodes.has('test-node')).toBe(false)
  })

  it('should not stop the node if refCount is still above 0', () => {
    // Create a node twice to increment refCount
    const nodes = new Map()
    nodes.set('test-node', {
      node: mockNode as Node<WindowMessage, FrameMessage>,
      options: nodeConfig,
      refCount: 2,
    })
    state.set('setup', {nodes})

    // Release once
    releaseNode({state, instance}, 'test-node')

    // Node should not be stopped
    expect(mockNode.stop).not.toHaveBeenCalled()

    // Verify refCount is 1
    const nodeEntry = state.get().nodes.get('test-node') as NodeEntry
    expect(nodeEntry?.refCount).toBe(1)
  })

  it('should handle multiple releases gracefully', () => {
    // Set up a node in the state
    const nodes = new Map()
    nodes.set('test-node', {
      node: mockNode as Node<WindowMessage, FrameMessage>,
      options: nodeConfig,
      refCount: 1,
    })
    state.set('setup', {nodes})

    // Release multiple times
    releaseNode({state, instance}, 'test-node')
    releaseNode({state, instance}, 'test-node')
    releaseNode({state, instance}, 'test-node')

    // Verify node is removed after first release
    expect(state.get().nodes.has('test-node')).toBe(false)
    // Stop should be called exactly once
    expect(mockNode.stop).toHaveBeenCalledTimes(1)
  })

  it('should handle releasing non-existent nodes', () => {
    // Should not throw when releasing non-existent node
    expect(() => releaseNode({state, instance}, 'non-existent')).not.toThrow()
  })

  it('should maintain correct state after complex operations', () => {
    // Set up a node with refCount = 3
    const nodes = new Map()
    nodes.set('test-node', {
      node: mockNode as Node<WindowMessage, FrameMessage>,
      options: nodeConfig,
      refCount: 3,
    })
    state.set('setup', {nodes})

    // Initial refCount should be 3
    let nodeEntry = state.get().nodes.get('test-node') as NodeEntry
    expect(nodeEntry?.refCount).toBe(3)

    // Release twice
    releaseNode({state, instance}, 'test-node')
    releaseNode({state, instance}, 'test-node')

    nodeEntry = state.get().nodes.get('test-node') as NodeEntry
    expect(nodeEntry?.refCount).toBe(1)

    // Verify node hasn't been stopped yet
    expect(mockNode.stop).not.toHaveBeenCalled()

    // Release final reference
    releaseNode({state, instance}, 'test-node')

    // Verify node was stopped
    expect(mockNode.stop).toHaveBeenCalled()

    expect(state.get().nodes.has('test-node')).toBe(false)
  })
})

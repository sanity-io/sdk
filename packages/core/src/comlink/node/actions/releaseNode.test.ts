import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import {type SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkNodeStore} from '../comlinkNodeStore'
import {getOrCreateNode} from './getOrCreateNode'
import {releaseNode} from './releaseNode'

const nodeConfig = {
  name: 'test-node',
  connectTo: 'parent',
}

vi.mock('@sanity/comlink', () => ({
  createNode: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}))

describe('releaseNode', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should stop and remove node when released', () => {
    const store = getOrCreateResource(instance, comlinkNodeStore)
    // Create a node
    const node = getOrCreateNode(instance, nodeConfig)
    const stopSpy = vi.spyOn(node, 'stop')

    expect(store.state.get().nodes.has('test-node')).toBe(true)

    // Release the node
    releaseNode(instance, 'test-node')

    // Check node is removed
    expect(stopSpy).toHaveBeenCalled()
    expect(store.state.get().nodes.has('test-node')).toBe(false)
  })

  it('should not stop the node if refCount is still above 0', () => {
    // Create a node twice to increment refCount
    const node = getOrCreateNode(instance, nodeConfig)
    getOrCreateNode(instance, nodeConfig)
    const stopSpy = vi.spyOn(node, 'stop')

    // Release once
    releaseNode(instance, 'test-node')

    // Node should not be stopped
    expect(stopSpy).not.toHaveBeenCalled()

    // Verify refCount is 1
    const store = getOrCreateResource(instance, comlinkNodeStore)
    const nodeEntry = store.state.get().nodes.get('test-node')
    expect(nodeEntry?.refCount).toBe(1)
  })

  it('should handle multiple releases gracefully', () => {
    // Create a node
    getOrCreateNode(instance, nodeConfig)

    // Release multiple times
    releaseNode(instance, 'test-node')
    releaseNode(instance, 'test-node')
    releaseNode(instance, 'test-node')

    // Verify refCount doesn't go below 0
    const store = getOrCreateResource(instance, comlinkNodeStore)
    expect(store.state.get().nodes.has('test-node')).toBe(false)
  })

  it('should handle releasing non-existent nodes', () => {
    // Should not throw when releasing non-existent node
    expect(() => releaseNode(instance, 'non-existent')).not.toThrow()
  })

  it('should maintain correct state after complex operations', () => {
    // Create node multiple times
    const node = getOrCreateNode(instance, nodeConfig)
    getOrCreateNode(instance, nodeConfig)
    getOrCreateNode(instance, nodeConfig)

    const store = getOrCreateResource(instance, comlinkNodeStore)
    let nodeEntry = store.state.get().nodes.get('test-node')

    // Initial refCount should be 3
    expect(nodeEntry?.refCount).toBe(3)

    // Release twice
    releaseNode(instance, 'test-node')
    releaseNode(instance, 'test-node')

    nodeEntry = store.state.get().nodes.get('test-node')
    expect(nodeEntry?.refCount).toBe(1)

    // Verify node hasn't been stopped yet
    const stopSpy = vi.spyOn(node, 'stop')
    expect(stopSpy).not.toHaveBeenCalled()

    // Release final reference
    releaseNode(instance, 'test-node')

    // Verify node was stopped
    expect(stopSpy).toHaveBeenCalled()

    nodeEntry = store.state.get().nodes.get('test-node')
    expect(store.state.get().nodes.has('test-node')).toBe(false)
  })
})

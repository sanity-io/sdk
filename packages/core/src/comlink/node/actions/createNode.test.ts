import * as comlink from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkNodeStore} from '../comlinkNodeStore'
import {createNode} from './createNode'

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
describe('createNode', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should create and start a node', () => {
    const node = createNode(instance, nodeConfig)

    expect(comlink.createNode).toHaveBeenCalledWith(nodeConfig)
    expect(node.start).toHaveBeenCalled()
  })

  it('should store the node in nodeStore', () => {
    const node = createNode(instance, nodeConfig)
    const store = getOrCreateResource(instance, comlinkNodeStore)
    expect(store.state.get().nodes.get('test-node')).toBe(node)
  })

  it('should return the existing node if it exists', () => {
    const node = createNode(instance, nodeConfig)
    const node2 = createNode(instance, nodeConfig)
    expect(node).toBe(node2)
  })
})

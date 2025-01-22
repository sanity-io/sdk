import * as comlink from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import {type SanityInstance} from '../../../instance/types'
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
describe('createNode', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should create and start a node', () => {
    const node = getOrCreateNode(instance, nodeConfig)

    expect(comlink.createNode).toHaveBeenCalledWith(nodeConfig)
    expect(node.start).toHaveBeenCalled()
  })

  it('should store the node in nodeStore', () => {
    const node = getOrCreateNode(instance, nodeConfig)

    expect(getOrCreateNode(instance, nodeConfig)).toBe(node)
  })

  it('should throw error when trying to create node with different options', () => {
    getOrCreateNode(instance, nodeConfig)

    expect(() =>
      getOrCreateNode(instance, {
        ...nodeConfig,
        connectTo: 'window',
      }),
    ).toThrow('Node "test-node" already exists with different options')
  })
})

import {type Node} from '@sanity/comlink'
import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import type {FrameMessage, WindowMessage} from '../../types'
import {createNode} from './createNode'
import {getNodeState} from './getNodeState'

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
  let node: Node<WindowMessage, FrameMessage>

  beforeEach(() => {
    instance = createSanityInstance(config)
    node = createNode(instance, nodeConfig)
  })

  it('should retrieve the node from the store', () => {
    const {getCurrent} = getNodeState(instance, nodeConfig.name)
    const retrievedNode = getCurrent()

    expect(retrievedNode).toBe(node)
  })
})

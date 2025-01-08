import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkNodeStore} from '../comlinkNodeStore'
import {getOrCreateNode} from './getOrCreateNode'
import {removeNode} from './removeNode'

vi.mock('@sanity/comlink', () => ({
  createNode: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}))

describe('removeNode', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should remove node from store', () => {
    getOrCreateNode(instance, {
      name: 'test',
      connectTo: 'parent',
    })

    removeNode(instance, 'test')
    const store = getOrCreateResource(instance, comlinkNodeStore)

    expect(store.state.get().nodes.has('test')).toBe(false)
  })

  it('should do nothing if node does not exist', () => {
    expect(() => removeNode(instance, 'nonexistent')).not.toThrow()
  })
})

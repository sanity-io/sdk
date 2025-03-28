import {type Node} from '@sanity/comlink'
import {beforeEach, describe, expect, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../../store/createSanityInstance'
import {createStoreState} from '../../store/createStoreState'
import {type FrameMessage, type WindowMessage} from '../types'
import {comlinkNodeStore} from './comlinkNodeStore'

describe('nodeStore', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test-project-id', dataset: 'test-dataset'})
  })

  it('should have correct initial state', () => {
    const initialState = comlinkNodeStore.getInitialState(instance)

    expect(initialState.nodes).toBeInstanceOf(Map)
    expect(initialState.nodes.size).toBe(0)
  })

  it('should cleanup nodes on dispose', () => {
    const mockNode = {
      stop: vi.fn(),
    } as unknown as Node<WindowMessage, FrameMessage>

    const initialState = comlinkNodeStore.getInitialState(instance)
    initialState.nodes.set('test-node', {
      options: {name: 'test-node', connectTo: 'parent'},
      node: mockNode,
      refCount: 1,
    })

    const cleanup = comlinkNodeStore.initialize?.({
      instance,
      state: createStoreState(initialState),
    })

    cleanup?.()
    expect(mockNode.stop).toHaveBeenCalled()
  })
})

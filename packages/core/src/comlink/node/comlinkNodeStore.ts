import {type Node, type NodeInput} from '@sanity/comlink'

import {createResource} from '../../resources/createResource'
import type {FrameMessage, WindowMessage} from '../types'

/**
 * Individual node with its relevant options
 * @public
 */
export interface NodeEntry {
  node: Node<WindowMessage, FrameMessage>
  options: NodeInput
}

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkNodeState {
  nodes: Map<string, NodeEntry>
}

export const comlinkNodeStore = createResource<ComlinkNodeState>({
  name: 'nodeStore',
  getInitialState: () => ({
    nodes: new Map(),
  }),
  initialize() {
    return () => {
      const state = this.state.get()
      state.nodes.forEach(({node}) => {
        node.stop()
      })
    }
  },
})

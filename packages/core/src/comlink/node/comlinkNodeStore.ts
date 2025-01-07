import {type Node} from '@sanity/comlink'

import {createResource} from '../../resources/createResource'
import type {FrameMessage, WindowMessage} from '../types'

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkNodeState {
  nodes: Map<string, Node<WindowMessage, FrameMessage>>
}

export const comlinkNodeStore = createResource<ComlinkNodeState>({
  name: 'nodeStore',
  getInitialState: () => ({
    nodes: new Map(),
  }),
  initialize() {
    return () => {
      const state = this.state.get()
      state.nodes.forEach((node) => {
        node.stop()
      })
    }
  },
})

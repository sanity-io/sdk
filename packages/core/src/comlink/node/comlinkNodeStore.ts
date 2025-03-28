import {type Node, type NodeInput} from '@sanity/comlink'

import {bindActionGlobally} from '../../store/createActionBinder'
import {defineStore} from '../../store/defineStore'
import {type FrameMessage, type WindowMessage} from '../types'
import {getOrCreateNode as unboundGetOrCreateNode} from './actions/getOrCreateNode'
import {releaseNode as unboundReleaseNode} from './actions/releaseNode'

/**
 * Individual node with its relevant options
 * @public
 */
export interface NodeEntry {
  node: Node<WindowMessage, FrameMessage>
  // we store options to ensure that channels remain as unique / consistent as possible
  options: NodeInput
  // we store refCount to ensure nodes are running only as long as they are in use
  refCount: number
}

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkNodeState {
  nodes: Map<string, NodeEntry>
}

export const comlinkNodeStore = defineStore<ComlinkNodeState>({
  name: 'nodeStore',
  getInitialState: () => ({
    nodes: new Map(),
  }),

  initialize({state}) {
    return () => {
      state.get().nodes.forEach(({node}) => {
        node.stop()
      })
    }
  },
})

/**
 * Signals to the store that the consumer has stopped using the node
 * @public
 */
export const releaseNode = bindActionGlobally(comlinkNodeStore, unboundReleaseNode)

/**
 * Retrieve or create a node to be used for communication between
 * an application and the controller -- specifically, a node should
 * be created within a frame / window to communicate with the controller.
 * @public
 */
export const getOrCreateNode = bindActionGlobally(comlinkNodeStore, unboundGetOrCreateNode)

import {type Node, type NodeInput, type Status} from '@sanity/comlink'

import {bindActionGlobally} from '../../store/createActionBinder'
import {type SanityInstance} from '../../store/createSanityInstance'
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
  // status of the node connection
  status: Status
  statusUnsub?: () => void
}

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkNodeState {
  nodes: Map<string, NodeEntry>
  // Map of node name to set of active subscriber symbols
  subscriptions: Map<string, Set<symbol>>
}

export const comlinkNodeStore = defineStore<ComlinkNodeState>({
  name: 'nodeStore',
  getInitialState: () => ({
    nodes: new Map(),
    subscriptions: new Map(),
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

const _getOrCreateNode = bindActionGlobally(comlinkNodeStore, unboundGetOrCreateNode)

/**
 * Retrieve or create a node to be used for communication between
 * an application and the controller -- specifically, a node should
 * be created within a frame / window to communicate with the controller.
 *
 * Nodes are shared by name, so the message types must match the protocol spoken on that name.
 * @public
 */
export function getOrCreateNode<
  TWindowMessage extends WindowMessage = WindowMessage,
  TFrameMessage extends FrameMessage = FrameMessage,
>(instance: SanityInstance, options: NodeInput): Node<TWindowMessage, TFrameMessage> {
  // The store keeps nodes of any protocol, so the message types are the caller's to assert.
  return _getOrCreateNode(instance, options) as Node<TWindowMessage, TFrameMessage>
}

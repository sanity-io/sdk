import {type Node, type NodeInput, type Status} from '@sanity/comlink'
import {createSelector} from 'reselect'

import {bindActionGlobally} from '../../store/createActionBinder'
import {createStateSourceAction, type SelectorContext} from '../../store/createStateSourceAction'
import {type FrameMessage, type WindowMessage} from '../types'
import {
  type ComlinkNodeState,
  comlinkNodeStore,
  getOrCreateNode,
  releaseNode,
} from './comlinkNodeStore'

const NODE_RELEASE_TIME = 5000

// Public shape for node state
/**
 * @public
 */
export interface NodeState {
  node: Node<WindowMessage, FrameMessage>
  status: Status | undefined
}
const selectNode = (context: SelectorContext<ComlinkNodeState>, nodeInput: NodeInput) =>
  context.state.nodes.get(nodeInput.name)

/**
 * Provides a subscribable state source for a node by name
 * @param instance - The Sanity instance to get the node state for
 * @param nodeInput - The configuration for the node to get the state for

 * @returns A subscribable state source for the node
 * @public
 */
export const getNodeState = bindActionGlobally(
  comlinkNodeStore,
  createStateSourceAction<ComlinkNodeState, [NodeInput], NodeState | undefined>({
    selector: createSelector([selectNode], (nodeEntry) => {
      return nodeEntry?.status === 'connected'
        ? {
            node: nodeEntry.node,
            status: nodeEntry.status,
          }
        : undefined
    }),
    onSubscribe: ({state, instance}, nodeInput) => {
      const nodeName = nodeInput.name
      const subscriberId = Symbol('comlink-node-subscriber')
      getOrCreateNode(instance, nodeInput)

      // Add subscriber to the set for this node
      let subs = state.get().subscriptions.get(nodeName)
      if (!subs) {
        subs = new Set()
        state.get().subscriptions.set(nodeName, subs)
      }
      subs.add(subscriberId)

      return () => {
        setTimeout(() => {
          const activeSubs = state.get().subscriptions.get(nodeName)
          if (activeSubs) {
            activeSubs.delete(subscriberId)
            if (activeSubs.size === 0) {
              state.get().subscriptions.delete(nodeName)
              releaseNode(instance, nodeName)
            }
          }
        }, NODE_RELEASE_TIME)
      }
    },
  }),
)

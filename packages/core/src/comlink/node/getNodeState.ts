import {type Node, type NodeInput, type Status} from '@sanity/comlink'
import {createSelector} from 'reselect'

import {bindActionGlobally} from '../../store/createActionBinder'
import {type SanityInstance} from '../../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../../store/createStateSourceAction'
import {setCleanupTimeout} from '../../utils/setCleanupTimeout'
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
export interface NodeState<
  TWindowMessage extends WindowMessage = WindowMessage,
  TFrameMessage extends FrameMessage = FrameMessage,
> {
  node: Node<TWindowMessage, TFrameMessage>
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
export function getNodeState<
  TWindowMessage extends WindowMessage = WindowMessage,
  TFrameMessage extends FrameMessage = FrameMessage,
>(
  instance: SanityInstance,
  nodeInput: NodeInput,
): StateSource<NodeState<TWindowMessage, TFrameMessage> | undefined> {
  // Same caller-asserted message types as `getOrCreateNode`.
  return _getNodeState(instance, nodeInput) as StateSource<
    NodeState<TWindowMessage, TFrameMessage> | undefined
  >
}

const _getNodeState = bindActionGlobally(
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
        setCleanupTimeout(() => {
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

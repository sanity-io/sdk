import {createNode, type Node, type NodeInput} from '@sanity/comlink'

import {createAction} from '../../../resources/createAction'
import {createStateSourceAction} from '../../../resources/createStateSourceAction'
import type {FrameMessage, WindowMessage} from '../../types'
import {comlinkNodeStore} from '../comlinkNodeStore'

/**
 * Retrieve or create a node to be used for communication between
 * an application and the controller -- specifically, a node should
 * be create within a frame / window to communicate with the controller.
 * @public
 */
export const getOrCreateNode = createAction(
  () => comlinkNodeStore,
  ({state}) => {
    return (options: NodeInput) => {
      const existing = state.get().nodes.get(options.name)
      if (existing) {
        if (
          existing.options.connectTo !== options.connectTo ||
          existing.options.domain !== options.domain
        ) {
          throw new Error(`Node "${options.name}" already exists with different options`)
        }
        return existing.node
      }

      const node: Node<WindowMessage, FrameMessage> = createNode(options)
      node.start()

      const nodes = new Map(state.get().nodes)
      nodes.set(options.name, {node, options})

      state.set('createNode', {nodes})

      return node
    }
  },
)

/**
 * Subscribable source for a node to communicate with a controller.
 * @public
 */
export const getNodeSource = createStateSourceAction(() => comlinkNodeStore, getOrCreateNode)

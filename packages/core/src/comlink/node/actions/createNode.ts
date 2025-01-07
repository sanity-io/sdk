import {createNode as comlinkCreateNode, type Node, type NodeInput} from '@sanity/comlink'

import {createAction} from '../../../resources/createAction'
import type {FrameMessage, WindowMessage} from '../../types'
import {comlinkNodeStore} from '../comlinkNodeStore'

/**
 * Create a node to be used for communication between
 * two applications -- specifically, a node should
 * be created within a frame / window to communicate with the enclosing app.
 * @public
 */
export const createNode = createAction(
  () => comlinkNodeStore,
  ({state}) => {
    return (options: NodeInput) => {
      const existing = state.get().nodes.get(options.name)
      if (existing) {
        return existing
      }

      const node: Node<WindowMessage, FrameMessage> = comlinkCreateNode(options)
      node.start()

      const nodes = new Map(state.get().nodes)
      nodes.set(options.name, node)

      state.set('createNode', {nodes})

      return node
    }
  },
)

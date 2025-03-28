import {createNode, type Node, type NodeInput} from '@sanity/comlink'
import {isEqual} from 'lodash-es'

import {type StoreContext} from '../../../store/defineStore'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ComlinkNodeState} from '../comlinkNodeStore'

/**
 * Retrieve or create a node to be used for communication between
 * an application and the controller -- specifically, a node should
 * be created within a frame / window to communicate with the controller.
 * @public
 */
export const getOrCreateNode = (
  {state}: StoreContext<ComlinkNodeState>,
  options: NodeInput,
): Node<WindowMessage, FrameMessage> => {
  const nodes = state.get().nodes
  const existing = nodes.get(options.name)

  // limit nodes to one per name
  if (existing) {
    if (!isEqual(existing.options, options)) {
      throw new Error(`Node "${options.name}" already exists with different options`)
    }

    state.set('incrementNodeRefCount', {
      nodes: new Map(nodes).set(options.name, {
        ...existing,
        refCount: existing.refCount + 1,
      }),
    })

    existing.node.start()
    return existing.node
  }

  const node: Node<WindowMessage, FrameMessage> = createNode(options)
  node.start()

  nodes.set(options.name, {node, options, refCount: 1})

  state.set('createNode', {nodes})

  return node
}

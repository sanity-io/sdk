import {createNode, type Node, type NodeInput} from '@sanity/comlink'
import {isEqual} from 'lodash-es'

import {type StoreContext} from '../../../store/defineStore'
import {type FrameMessage, type WindowMessage} from '../../types'
import {type ComlinkNodeState} from '../comlinkNodeStore'

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

    existing.node.start()
    return existing.node
  }

  const node: Node<WindowMessage, FrameMessage> = createNode(options)
  node.start()

  // Subscribe to status changes
  const statusUnsub = node.onStatus((status) => {
    const currentNodes = state.get().nodes
    const currentEntry = currentNodes.get(options.name)
    if (!currentEntry) return
    const updatedEntry = {
      ...currentEntry,
      status,
    }
    state.set('updateNodeStatus', {
      nodes: new Map(currentNodes).set(options.name, updatedEntry),
    })
  })

  // Set up initial entry with status, error, and statusUnsub
  const entry = {
    node,
    options,
    status: 'idle' as const,
    statusUnsub,
  }

  nodes.set(options.name, entry)

  state.set('createNode', {nodes})

  return node
}

import {type StoreContext} from '../../../store/defineStore'
import {type ComlinkNodeState} from '../comlinkNodeStore'

/**
 * Signals to the store that the consumer has stopped using the node
 * @public
 */
export const releaseNode = ({state}: StoreContext<ComlinkNodeState>, name: string): void => {
  const nodes = state.get().nodes
  const nodeEntry = nodes.get(name)

  if (nodeEntry) {
    const newRefCount = nodeEntry.refCount === 0 ? 0 : nodeEntry.refCount - 1

    if (newRefCount === 0) {
      nodeEntry.node.stop()
      nodes.delete(name)
      state.set('releaseNode', {nodes: new Map(nodes)})
    } else {
      state.set('releaseNode', {
        nodes: new Map(nodes).set(name, {
          ...nodeEntry,
          refCount: newRefCount,
        }),
      })
    }
  }
}

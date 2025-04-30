import {type StoreContext} from '../../../store/defineStore'
import {type ComlinkNodeState} from '../comlinkNodeStore'

/**
 * Release a node that was previously created with getOrCreateNode.
 * @public
 */
export const releaseNode = ({state}: StoreContext<ComlinkNodeState>, name: string): void => {
  const nodes = state.get().nodes
  const existing = nodes.get(name)

  if (existing) {
    const newRefCount = existing.refCount - 1

    if (newRefCount <= 0) {
      existing.node.stop()
      nodes.delete(name)
      state.set('removeNode', {nodes})
      return
    }

    state.set('decrementNodeRefCount', {
      nodes: new Map(nodes).set(name, {
        ...existing,
        refCount: newRefCount,
      }),
    })
    return
  }
}

import {createAction} from '../../../resources/createAction'
import {comlinkNodeStore} from '../comlinkNodeStore'

/**
 * Signals to the store that the consumer has stopped using the node
 * @public
 */
export const releaseNode = createAction(comlinkNodeStore, ({state}) => {
  return (name: string) => {
    const nodes = state.get().nodes
    const nodeEntry = nodes.get(name)

    if (nodeEntry) {
      const newRefCount = nodeEntry.refCount === 0 ? 0 : nodeEntry.refCount - 1
      state.set('releaseNode', {
        nodes: new Map(nodes).set(name, {
          ...nodeEntry,
          refCount: newRefCount,
        }),
      })
      if (newRefCount === 0) {
        nodeEntry.node.stop()
      }
    }
  }
})

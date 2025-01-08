import {createAction} from '../../../resources/createAction'
import {comlinkNodeStore} from '../comlinkNodeStore'

/**
 * Remove a node and clean up its resources
 * @public
 */
export const removeNode = createAction(
  () => comlinkNodeStore,
  ({state}) => {
    return (name: string) => {
      const nodeEntry = state.get().nodes.get(name)
      if (!nodeEntry) {
        return false
      }

      nodeEntry.node.stop()

      const nodes = new Map(state.get().nodes)
      nodes.delete(name)
      state.set('removeNode', {nodes})

      return true
    }
  },
)

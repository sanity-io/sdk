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
      const node = state.get().nodes.get(name)
      if (!node) {
        return false
      }

      // Stop the node
      node.stop()

      // Remove from store
      const nodes = new Map(state.get().nodes)
      nodes.delete(name)
      state.set('removeNode', {nodes})

      return true
    }
  },
)

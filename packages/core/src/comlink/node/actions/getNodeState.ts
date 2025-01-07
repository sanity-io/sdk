import {createStateSourceAction} from '../../../resources/createStateSourceAction'
import {comlinkNodeStore} from '../comlinkNodeStore'

/**
 * Subscribable source for a node to communicate with a controller.
 * @public
 */
export const getNodeState = createStateSourceAction(
  () => comlinkNodeStore,
  (state, name: string) => {
    return state.nodes.get(name)
  },
)

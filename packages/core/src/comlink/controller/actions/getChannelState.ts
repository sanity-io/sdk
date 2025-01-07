import {createStateSourceAction} from '../../../resources/createStateSourceAction'
import {getComlinkControllerStore} from '../comlinkControllerStore'

/**
 * Subscribable source for a particular channel, retrieved by options.
 * @public
 */
export const getChannelState = createStateSourceAction(
  getComlinkControllerStore,
  (state, name: string) => {
    return state.channels.get(name)
  },
)

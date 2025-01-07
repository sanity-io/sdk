import {createStateSourceAction} from '../../../resources/createStateSourceAction'
import {getComlinkControllerStore} from '../comlinkControllerStore'

/**
 * Subscribable source for the controller.
 * @public
 */
export const getControllerState = createStateSourceAction(getComlinkControllerStore, (state) => {
  return state.controller
})

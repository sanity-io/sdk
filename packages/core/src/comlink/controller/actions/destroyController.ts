import {type StoreContext} from '../../../store/defineStore'
import {type ComlinkControllerState} from '../comlinkControllerStore'

/**
 * Calls the destroy method on the controller and resets the controller state.
 * @public
 */
export const destroyController = ({state}: StoreContext<ComlinkControllerState>): void => {
  const {controller} = state.get()

  if (controller) {
    controller.destroy()
    state.set('destroyController', {
      controller: null,
      channels: new Map(),
    })
  }
}

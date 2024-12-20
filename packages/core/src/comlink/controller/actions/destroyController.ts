import {createAction} from '../../../resources/createAction'
import {comlinkControllerStore} from '../comlinkControllerStore'

/**
 * Calls the destroy method on the controller and resets the controller state.
 * @public
 */
export const destroyController = createAction(
  () => comlinkControllerStore,
  ({state}) => {
    return () => {
      const {controller} = state.get()

      if (controller) {
        controller.destroy()
        state.set('destroyController', {
          controller: null,
          channels: new Map(),
        })
      }
    }
  },
)

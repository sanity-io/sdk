import {createInternalAction} from '../../../resources/createAction'
import type {ComlinkControllerState} from '../comlinkControllerStore'

/**
 * Calls the destroy method on the controller and resets the controller state.
 * @public
 */
export const destroyController = createInternalAction<ComlinkControllerState, [], void>(
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

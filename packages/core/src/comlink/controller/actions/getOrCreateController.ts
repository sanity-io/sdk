import {createController} from '@sanity/comlink'

import {createAction} from '../../../resources/createAction'
import {createStateSourceAction} from '../../../resources/createStateSourceAction'
import {comlinkControllerStore} from '../comlinkControllerStore'

/**
 * Initializes or fetches a controller to handle communication
 * between an application and iframes.
 * @public
 */
export const getOrCreateController = createAction(
  () => comlinkControllerStore,
  ({state}) => {
    return (targetOrigin: string) => {
      if (state.get().controller) {
        return state.get().controller
      }

      const controller = createController({targetOrigin})
      state.set('initializeController', {
        controller,
      })

      return controller
    }
  },
)

/**
 * Subscribable source for the controller.
 * @public
 */
export const getControllerSource = createStateSourceAction(
  () => comlinkControllerStore,
  getOrCreateController,
)

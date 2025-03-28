import {type Controller, createController} from '@sanity/comlink'

import {type StoreContext} from '../../../store/defineStore'
import {type ComlinkControllerState} from '../comlinkControllerStore'
import {destroyController} from './destroyController'

/**
 * Initializes or fetches a controller to handle communication
 * between an application and iframes.
 * @public
 */
export const getOrCreateController = (
  {state, instance}: StoreContext<ComlinkControllerState>,
  targetOrigin: string,
): Controller => {
  const {controller, controllerOrigin} = state.get()
  if (controller && controllerOrigin === targetOrigin) {
    return controller
  }

  // if the target origin has changed, we'll create a new controller,
  // but need to clean up first
  if (controller) {
    destroyController({state, instance})
  }

  const newController = createController({targetOrigin})
  state.set('initializeController', {
    controllerOrigin: targetOrigin,
    controller: newController,
  })

  return newController
}

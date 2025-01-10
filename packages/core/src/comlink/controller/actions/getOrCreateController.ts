import {createController} from '@sanity/comlink'

import {createAction} from '../../../resources/createAction'
import {comlinkControllerStore} from '../comlinkControllerStore'
import {destroyController} from './destroyController'

/**
 * Initializes or fetches a controller to handle communication
 * between an application and iframes.
 * @public
 */
export const getOrCreateController = createAction(comlinkControllerStore, ({state, instance}) => {
  return (targetOrigin: string) => {
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
})

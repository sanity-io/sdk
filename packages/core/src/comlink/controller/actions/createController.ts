import {createController as comlinkCreateController} from '@sanity/comlink'

import {createAction} from '../../../resources/createAction'
import {getComlinkControllerStore} from '../comlinkControllerStore'

/**
 * Initializes or fetches a controller to handle communication
 * between an application and iframes.
 * @public
 */
export const createController = createAction(getComlinkControllerStore, ({state}) => {
  return (targetOrigin: string) => {
    const controller = comlinkCreateController({targetOrigin})
    state.set('initializeController', {
      controller,
    })

    return controller
  }
})

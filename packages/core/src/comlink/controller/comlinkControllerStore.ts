import {type ChannelInput, type ChannelInstance, type Controller} from '@sanity/comlink'

import {bindActionGlobally} from '../../store/createActionBinder'
import {defineStore} from '../../store/defineStore'
import {type FrameMessage, type WindowMessage} from '../types'
import {destroyController as unboundDestroyController} from './actions/destroyController'
import {getOrCreateChannel as unboundGetOrCreateChannel} from './actions/getOrCreateChannel'
import {getOrCreateController as unboundGetOrCreateController} from './actions/getOrCreateController'
import {releaseChannel as unboundReleaseChannel} from './actions/releaseChannel'

/**
 * Individual channel with its relevant options
 * @public
 */
export interface ChannelEntry {
  channel: ChannelInstance<FrameMessage, WindowMessage>
  // we store options to ensure that channels remain as unique / consistent as possible
  options: ChannelInput
  // we store refCount to ensure channels remain open only as long as they are in use
  refCount: number
}

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkControllerState {
  controller: Controller | null
  controllerOrigin: string | null
  channels: Map<string, ChannelEntry>
}

export const comlinkControllerStore = defineStore<ComlinkControllerState>({
  name: 'connectionStore',
  getInitialState: () => {
    const initialState = {
      controller: null,
      controllerOrigin: null,
      channels: new Map(),
    }
    return initialState
  },
  initialize({instance}) {
    return () => {
      // destroying controller also destroys channels
      destroyController(instance)
    }
  },
})

/**
 * Calls the destroy method on the controller and resets the controller state.
 * @public
 */
export const destroyController = bindActionGlobally(
  comlinkControllerStore,
  unboundDestroyController,
)

/**
 * Retrieve or create a channel to be used for communication between
 * an application and the controller.
 * @public
 */
export const getOrCreateChannel = bindActionGlobally(
  comlinkControllerStore,
  unboundGetOrCreateChannel,
)

/**
 * Initializes or fetches a controller to handle communication
 * between an application and iframes.
 * @public
 */
export const getOrCreateController = bindActionGlobally(
  comlinkControllerStore,
  unboundGetOrCreateController,
)

/**
 * Signals to the store that the consumer has stopped using the channel
 * @public
 */
export const releaseChannel = bindActionGlobally(comlinkControllerStore, unboundReleaseChannel)

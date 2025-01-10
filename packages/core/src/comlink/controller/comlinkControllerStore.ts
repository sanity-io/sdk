import {type ChannelInput, type ChannelInstance, type Controller} from '@sanity/comlink'

import {createResource} from '../../resources/createResource'
import {type FrameMessage, type WindowMessage} from '../types'
import {destroyController} from './actions/destroyController'

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

export const comlinkControllerStore = createResource<ComlinkControllerState>({
  name: 'connectionStore',
  getInitialState: () => {
    const initialState = {
      controller: null,
      controllerOrigin: null,
      channels: new Map(),
    }
    return initialState
  },
  initialize() {
    return () => {
      // destroying controller also destroys channels
      destroyController(this)
    }
  },
})

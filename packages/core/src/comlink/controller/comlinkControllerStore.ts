import {type ChannelInstance, type Controller} from '@sanity/comlink'

import {createResource, type Resource} from '../../resources/createResource'
import {type FrameMessage, type WindowMessage} from '../types'
import {destroyController} from './actions/destroyController'

/**
 * Options for creating a channel
 * @public
 */
export interface CreateChannelOptions {
  name: string
  connectTo: string
  heartbeat?: boolean
}

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkControllerState {
  controller: Controller | null
  channels: Map<string, ChannelInstance<FrameMessage, WindowMessage>>
}

export const comlinkControllerStore = createResource<ComlinkControllerState>({
  name: 'connectionStore',
  getInitialState: () => {
    const initialState = {
      controller: null,
      channels: new Map(),
    }
    return initialState
  },
  initialize() {
    return () => {
      destroyController(this)
    }
  },
})

export function getComlinkControllerStore(): Resource<ComlinkControllerState> {
  return comlinkControllerStore
}

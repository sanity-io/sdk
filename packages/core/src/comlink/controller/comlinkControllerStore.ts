import {type ChannelInstance, type Controller} from '@sanity/comlink'

import {createResource} from '../../resources/createResource'
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
 * Individual channel with its relevant options
 * @public
 */
export interface ChannelEntry {
  channel: ChannelInstance<FrameMessage, WindowMessage>
  options: CreateChannelOptions
}

/**
 * Internal state tracking comlink connections
 * @public
 */
export interface ComlinkControllerState {
  controller: Controller | null
  channels: Map<string, ChannelEntry>
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

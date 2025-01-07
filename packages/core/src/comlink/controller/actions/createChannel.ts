import {createAction} from '../../../resources/createAction'
import {type CreateChannelOptions, getComlinkControllerStore} from '../comlinkControllerStore'

/**
 * Creates a new channel on the controller
 * @public
 */
export const createChannel = createAction(getComlinkControllerStore, ({state}) => {
  return (options: CreateChannelOptions) => {
    const controller = state.get().controller

    if (!controller) {
      throw new Error('Controller must be initialized before creating channels')
    }

    const channel = controller.createChannel(options)
    state.set('createChannel', {
      channels: new Map(state.get().channels).set(options.name, channel),
    })

    return channel
  }
})

import {createAction} from '../../../resources/createAction'
import {createStateSourceAction} from '../../../resources/createStateSourceAction'
import {comlinkControllerStore, type CreateChannelOptions} from '../comlinkControllerStore'

/**
 * Retrieve or create a channel to be used for communication between
 * an application and the controller.
 * @public
 */
export const getOrCreateChannel = createAction(
  () => comlinkControllerStore,
  ({state}) => {
    return (options: CreateChannelOptions) => {
      const controller = state.get().controller

      if (!controller) {
        throw new Error('Controller must be initialized before using or creating channels')
      }

      const existing = state.get().channels.get(options.name)

      // limit channels to one per name
      if (existing) {
        if (
          existing.options.connectTo !== options.connectTo ||
          existing.options.heartbeat !== options.heartbeat
        ) {
          throw new Error(`Channel "${options.name}" already exists with different options`)
        }
        return existing.channel
      }

      const channel = controller.createChannel(options)
      state.set('createChannel', {
        channels: new Map(state.get().channels).set(options.name, {
          channel,
          options,
        }),
      })

      return channel
    }
  },
)
/**
 * Subscribable source for a particular channel, retrieved by options.
 * @public
 */
export const getChannelSource = createStateSourceAction(
  () => comlinkControllerStore,
  getOrCreateChannel,
)

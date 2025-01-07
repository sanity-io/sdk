import {createAction} from '../../../resources/createAction'
import {comlinkControllerStore} from '../comlinkControllerStore'

/**
 * Removes a channel from the comlink store.
 * @public
 */
export const removeChannel = createAction(
  () => comlinkControllerStore,
  ({state}) => {
    return (name: string) => {
      const channels = state.get().channels
      const channel = channels.get(name)

      if (channel) {
        channel.stop()
        const newChannels = new Map(channels)
        newChannels.delete(name)

        state.set('removeChannel', {channels: newChannels})
      }
    }
  },
)

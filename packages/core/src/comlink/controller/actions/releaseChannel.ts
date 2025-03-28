import {type StoreContext} from '../../../store/defineStore'
import {type ComlinkControllerState} from '../comlinkControllerStore'

/**
 * Signals to the store that the consumer has stopped using the channel
 * @public
 */
export const releaseChannel = (
  {state}: StoreContext<ComlinkControllerState>,
  name: string,
): void => {
  const channels = state.get().channels
  const channelEntry = channels.get(name)

  if (channelEntry) {
    const newRefCount = channelEntry.refCount === 0 ? 0 : channelEntry.refCount - 1

    if (newRefCount === 0) {
      channelEntry.channel.stop()
      channels.delete(name)
      state.set('releaseChannel', {channels: new Map(channels)})
    } else {
      state.set('releaseChannel', {
        channels: new Map(channels).set(name, {
          ...channelEntry,
          refCount: newRefCount,
        }),
      })
    }
  }
}

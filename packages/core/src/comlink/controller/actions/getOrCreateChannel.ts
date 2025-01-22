import {type ChannelInput} from '@sanity/comlink'
import {isEqual} from 'lodash-es'

import {createAction} from '../../../resources/createAction'
import {comlinkControllerStore} from '../comlinkControllerStore'

/**
 * Retrieve or create a channel to be used for communication between
 * an application and the controller.
 * @public
 */
export const getOrCreateChannel = createAction(comlinkControllerStore, ({state}) => {
  return (options: ChannelInput) => {
    const controller = state.get().controller

    if (!controller) {
      throw new Error('Controller must be initialized before using or creating channels')
    }

    const channels = state.get().channels
    const existing = channels.get(options.name)

    // limit channels to one per name
    if (existing) {
      if (!isEqual(existing.options, options)) {
        throw new Error(`Channel "${options.name}" already exists with different options`)
      }

      state.set('incrementChannelRefCount', {
        channels: new Map(channels).set(options.name, {
          ...existing,
          refCount: existing.refCount + 1,
        }),
      })
      existing.channel.start()
      return existing.channel
    }

    const channel = controller.createChannel(options)
    channel.start()
    state.set('createChannel', {
      channels: new Map(channels).set(options.name, {
        channel,
        options,
        refCount: 1,
      }),
    })

    return channel
  }
})

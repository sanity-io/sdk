import {
  type FrameMessage,
  getChannelSource,
  getControllerSource,
  type WindowMessage,
} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Function to handle messages from the window or iframe.
 * @public
 */
export type MessageHandler<TWindowMessage extends WindowMessage> = (
  data: TWindowMessage['data'],
) => void
/**
 * Options for the useFrameConnection hook
 * @public
 */
export interface UseFrameConnectionOptions<TWindowMessage extends WindowMessage> {
  name: string
  connectTo: string
  targetOrigin: string
  onMessage?: Record<string, MessageHandler<TWindowMessage>>
}

/**
 * Frame connections manage connections to iFrames or other windows
 * @public
 */
export interface FrameConnection<TFrameMessage extends FrameMessage> {
  connect: (frameWindow: Window) => void
  sendMessage: <T extends TFrameMessage['type']>(
    ...params: Extract<TFrameMessage, {type: T}>['data'] extends undefined
      ? [type: T] // Comlink allows sending messages without data
      : [type: T, data: Extract<TFrameMessage, {type: T}>['data']]
  ) => void
}

/**
 * Frame connections manage connections to iFrames or other windows
 * via the Comlink API.
 * @public
 */
export function useFrameConnection<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>(options: UseFrameConnectionOptions<TWindowMessage>): FrameConnection<TFrameMessage> {
  const {name, connectTo, targetOrigin, onMessage} = options
  const instance = useSanityInstance()

  const {subscribe: subscribeToChannel, getCurrent: getCurrentChannel} = useMemo(
    () => getChannelSource(instance, {name, connectTo}),

    [instance, name, connectTo],
  )

  const {subscribe: subscribeToController, getCurrent: getCurrentController} = useMemo(
    () => getControllerSource(instance, targetOrigin),
    [instance, targetOrigin],
  )

  const channel = useSyncExternalStore(subscribeToChannel, getCurrentChannel)

  const controller = useSyncExternalStore(subscribeToController, getCurrentController)

  useEffect(() => {
    if (onMessage) {
      const messageHandlers: Array<[string, MessageHandler<TWindowMessage>]> =
        Object.entries(onMessage)

      messageHandlers.forEach(([type, handler]) => {
        channel.on(type, (data) => {
          handler(data)
          return undefined
        })
      })
    }
  }, [channel, onMessage])

  const connect = useCallback(
    (frameWindow: Window) => {
      controller?.addTarget(frameWindow)
    },
    [controller],
  )

  const sendMessage = useCallback(
    <T extends TFrameMessage['type']>(
      type: T,
      data?: Extract<TFrameMessage, {type: T}>['data'],
    ) => {
      channel.post(type, data)
    },
    [channel],
  )

  return {
    connect,
    sendMessage,
  }
}

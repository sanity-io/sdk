import {
  type FrameMessage,
  getOrCreateChannel,
  getOrCreateController,
  releaseChannel,
  type WindowMessage,
} from '@sanity/sdk'
import {useCallback, useEffect, useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 */
export type FrameMessageHandler<TWindowMessage extends WindowMessage> = (
  event: TWindowMessage['data'],
) => TWindowMessage['response'] | Promise<TWindowMessage['response']>

/**
 * @public
 */
export interface UseFrameConnectionOptions<TWindowMessage extends WindowMessage> {
  name: string
  connectTo: string
  targetOrigin: string
  onMessage?: Record<string, FrameMessageHandler<TWindowMessage>>
}

/**
 * @public
 */
export interface FrameConnection<TFrameMessage extends FrameMessage> {
  connect: (frameWindow: Window) => () => void // Return cleanup function
  sendMessage: <T extends TFrameMessage['type']>(
    ...params: Extract<TFrameMessage, {type: T}>['data'] extends undefined
      ? [type: T]
      : [type: T, data: Extract<TFrameMessage, {type: T}>['data']]
  ) => void
}

/**
 * @public
 */
export function useFrameConnection<
  TFrameMessage extends FrameMessage,
  TWindowMessage extends WindowMessage,
>(options: UseFrameConnectionOptions<TWindowMessage>): FrameConnection<TFrameMessage> {
  const {onMessage, targetOrigin, name, connectTo} = options
  const instance = useSanityInstance()

  const controller = useMemo(
    () => getOrCreateController(instance, targetOrigin),
    [instance, targetOrigin],
  )

  const channel = useMemo(
    () =>
      getOrCreateChannel(instance, {
        name,
        connectTo,
      }),
    [instance, name, connectTo],
  )

  useEffect(() => {
    if (!channel || !onMessage) return

    const unsubscribers: Array<() => void> = []

    Object.entries(onMessage).forEach(([type, handler]) => {
      const unsubscribe = channel.on(type, handler)
      unsubscribers.push(unsubscribe)
    })

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [channel, onMessage])

  const connect = useCallback(
    (frameWindow: Window) => {
      const removeTarget = controller?.addTarget(frameWindow)
      return () => {
        removeTarget?.()
      }
    },
    [controller],
  )

  const sendMessage = useCallback(
    <T extends TFrameMessage['type']>(
      type: T,
      data?: Extract<TFrameMessage, {type: T}>['data'],
    ) => {
      channel?.post(type, data)
    },
    [channel],
  )

  // cleanup channel on unmount
  useEffect(() => {
    return () => {
      releaseChannel(instance, name)
    }
  }, [name, instance])

  return {
    connect,
    sendMessage,
  }
}

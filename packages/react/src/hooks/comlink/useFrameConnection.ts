import {type ChannelInstance, type Controller, type Status} from '@sanity/comlink'
import {
  type FrameMessage,
  getOrCreateChannel,
  getOrCreateController,
  releaseChannel,
  type WindowMessage,
} from '@sanity/sdk'
import {useCallback, useEffect, useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @internal
 */
export type FrameMessageHandler<TWindowMessage extends WindowMessage> = (
  event: TWindowMessage['data'],
) => TWindowMessage['response'] | Promise<TWindowMessage['response']>

/**
 * @internal
 */
export interface UseFrameConnectionOptions<TWindowMessage extends WindowMessage> {
  name: string
  connectTo: string
  targetOrigin: string
  onMessage?: {
    [K in TWindowMessage['type']]: (data: Extract<TWindowMessage, {type: K}>['data']) => void
  }
  heartbeat?: boolean
  onStatus?: (status: Status) => void
}

/**
 * @internal
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
 * @internal
 */
export function useFrameConnection<
  TFrameMessage extends FrameMessage,
  TWindowMessage extends WindowMessage,
>(options: UseFrameConnectionOptions<TWindowMessage>): FrameConnection<TFrameMessage> {
  const {onMessage, targetOrigin, name, connectTo, heartbeat, onStatus} = options
  const instance = useSanityInstance()
  const controllerRef = useRef<Controller | null>(null)
  const channelRef = useRef<ChannelInstance<TFrameMessage, TWindowMessage> | null>(null)

  useEffect(() => {
    const controller = getOrCreateController(instance, targetOrigin)
    const channel = getOrCreateChannel(instance, {name, connectTo, heartbeat})
    controllerRef.current = controller
    channelRef.current = channel

    channel.onStatus((event) => {
      onStatus?.(event.status)
    })

    const messageUnsubscribers: Array<() => void> = []

    if (onMessage) {
      Object.entries(onMessage).forEach(([type, handler]) => {
        const unsubscribe = channel.on(type, handler as FrameMessageHandler<TWindowMessage>)
        messageUnsubscribers.push(unsubscribe)
      })
    }

    return () => {
      // Clean up all subscriptions and stop controller/channel
      messageUnsubscribers.forEach((unsub) => unsub())
      releaseChannel(instance, name)
      channelRef.current = null
      controllerRef.current = null
    }
  }, [targetOrigin, name, connectTo, heartbeat, onMessage, instance, onStatus])

  const connect = useCallback((frameWindow: Window) => {
    const removeTarget = controllerRef.current?.addTarget(frameWindow)
    return () => {
      removeTarget?.()
    }
  }, [])

  const sendMessage = useCallback(
    <T extends TFrameMessage['type']>(
      type: T,
      data?: Extract<TFrameMessage, {type: T}>['data'],
    ) => {
      channelRef.current?.post(type, data)
    },
    [],
  )

  return {
    connect,
    sendMessage,
  }
}

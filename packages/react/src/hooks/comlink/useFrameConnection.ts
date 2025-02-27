import {type Status} from '@sanity/comlink'
import {
  type FrameMessage,
  getOrCreateChannel,
  getOrCreateController,
  releaseChannel,
  type WindowMessage,
} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useState} from 'react'

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
  status: Status
}

/**
 * @internal
 */
export function useFrameConnection<
  TFrameMessage extends FrameMessage,
  TWindowMessage extends WindowMessage,
>(options: UseFrameConnectionOptions<TWindowMessage>): FrameConnection<TFrameMessage> {
  const {onMessage, targetOrigin, name, connectTo, heartbeat} = options
  const instance = useSanityInstance()
  const [status, setStatus] = useState<Status>('idle')

  const controller = useMemo(
    () => getOrCreateController(instance, targetOrigin),
    [instance, targetOrigin],
  )

  const channel = useMemo(
    () =>
      getOrCreateChannel(instance, {
        name,
        connectTo,
        heartbeat,
      }),
    [instance, name, connectTo, heartbeat],
  )

  useEffect(() => {
    if (!channel) return

    const unsubscribe = channel.onStatus((event) => {
      setStatus(event.status)
    })

    return unsubscribe
  }, [channel])

  useEffect(() => {
    if (!channel || !onMessage) return

    const unsubscribers: Array<() => void> = []

    Object.entries(onMessage).forEach(([type, handler]) => {
      // type assertion, but we've already constrained onMessage to have the correct handler type
      const unsubscribe = channel.on(type, handler as FrameMessageHandler<TWindowMessage>)
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
    status,
  }
}

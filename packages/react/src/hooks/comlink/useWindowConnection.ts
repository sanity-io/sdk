import {type Status} from '@sanity/comlink'
import {type FrameMessage, getOrCreateNode, releaseNode, type WindowMessage} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @internal
 */
export type WindowMessageHandler<TFrameMessage extends FrameMessage> = (
  event: TFrameMessage['data'],
) => TFrameMessage['response']

/**
 * @internal
 */
export interface UseWindowConnectionOptions<TMessage extends FrameMessage> {
  name: string
  connectTo: string
  onMessage?: Record<TMessage['type'], WindowMessageHandler<TMessage>>
}

/**
 * @internal
 */
export interface WindowConnection<TMessage extends WindowMessage> {
  sendMessage: <TType extends TMessage['type']>(
    type: TType,
    data?: Extract<TMessage, {type: TType}>['data'],
  ) => void
  status: Status
}

/**
 * @internal
 */
export function useWindowConnection<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>(options: UseWindowConnectionOptions<TFrameMessage>): WindowConnection<TWindowMessage> {
  const {name, onMessage, connectTo} = options
  const instance = useSanityInstance()
  const [status, setStatus] = useState<Status>('idle')

  const node = useMemo(
    () => getOrCreateNode(instance, {name, connectTo}),
    [instance, name, connectTo],
  )

  useEffect(() => {
    const unsubscribe = node.onStatus((newStatus) => {
      setStatus(newStatus)
    })

    return unsubscribe
  }, [node, instance, name])

  useEffect(() => {
    if (!onMessage) return

    const unsubscribers: Array<() => void> = []

    Object.entries(onMessage).forEach(([type, handler]) => {
      const unsubscribe = node.on(type, handler as WindowMessageHandler<TFrameMessage>)
      unsubscribers.push(unsubscribe)
    })

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [node, onMessage])

  const sendMessage = useCallback(
    <TType extends WindowMessage['type']>(
      type: TType,
      data?: Extract<WindowMessage, {type: TType}>['data'],
    ) => {
      node?.post(type, data)
    },
    [node],
  )

  // cleanup node on unmount
  useEffect(() => {
    return () => {
      releaseNode(instance, name)
    }
  }, [instance, name])

  return {
    sendMessage,
    status,
  }
}

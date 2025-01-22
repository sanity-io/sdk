import {type FrameMessage, getOrCreateNode, releaseNode, type WindowMessage} from '@sanity/sdk'
import {useCallback, useEffect, useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 */
export type WindowMessageHandler<TFrameMessage extends FrameMessage> = (
  event: TFrameMessage['data'],
) => TFrameMessage['response']

/**
 * @public
 */
export interface UseWindowConnectionOptions<TMessage extends FrameMessage> {
  name: string
  connectTo: string
  onMessage?: Record<TMessage['type'], WindowMessageHandler<TMessage>>
}

/**
 * @public
 */
export interface WindowConnection<TMessage extends WindowMessage> {
  sendMessage: <TType extends TMessage['type']>(
    type: TType,
    data?: Extract<TMessage, {type: TType}>['data'],
  ) => void
}

/**
 * @public
 */
export function useWindowConnection<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>(options: UseWindowConnectionOptions<TFrameMessage>): WindowConnection<TWindowMessage> {
  const {name, onMessage, connectTo} = options
  const instance = useSanityInstance()

  const node = useMemo(
    () => getOrCreateNode(instance, {name, connectTo}),
    [instance, name, connectTo],
  )

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
  }
}

import {type Node, type Status} from '@sanity/comlink'
import {type FrameMessage, getOrCreateNode, releaseNode, type WindowMessage} from '@sanity/sdk'
import {useCallback, useEffect, useRef} from 'react'

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
  onStatus?: (status: Status) => void
}

/**
 * @internal
 */
export interface WindowConnection<TMessage extends WindowMessage> {
  sendMessage: <TType extends TMessage['type']>(
    type: TType,
    data?: Extract<TMessage, {type: TType}>['data'],
  ) => void
}

/**
 * @internal
 */
export function useWindowConnection<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>({
  name,
  connectTo,
  onMessage,
  onStatus,
}: UseWindowConnectionOptions<TFrameMessage>): WindowConnection<TWindowMessage> {
  const nodeRef = useRef<Node<TWindowMessage, TFrameMessage> | null>(null)
  const messageUnsubscribers = useRef<(() => void)[]>([])
  const instance = useSanityInstance()

  useEffect(() => {
    // the type cast is unfortunate, but the generic type of the node is not known here.
    // We know that the node is a WindowMessage node, but not the generic types.
    const node = getOrCreateNode(instance, {
      name,
      connectTo,
    }) as unknown as Node<TWindowMessage, TFrameMessage>
    nodeRef.current = node

    const statusUnsubscribe = node.onStatus((eventStatus) => {
      onStatus?.(eventStatus)
    })

    if (onMessage) {
      Object.entries(onMessage).forEach(([type, handler]) => {
        const messageUnsubscribe = node.on(type, handler as WindowMessageHandler<TFrameMessage>)
        messageUnsubscribers.current.push(messageUnsubscribe)
      })
    }

    return () => {
      statusUnsubscribe()
      messageUnsubscribers.current.forEach((unsubscribe) => unsubscribe())
      messageUnsubscribers.current = []
      releaseNode(instance, name)
      nodeRef.current = null
    }
  }, [instance, name, connectTo, onMessage, onStatus])

  const sendMessage = useCallback(
    (type: TWindowMessage['type'], data?: Extract<TWindowMessage, {type: typeof type}>['data']) => {
      if (!nodeRef.current) {
        throw new Error('Cannot send message before connection is established')
      }
      nodeRef.current.post(type, data)
    },
    [],
  )

  return {
    sendMessage,
  }
}

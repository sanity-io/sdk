import {type MessageData, type Node, type Status} from '@sanity/comlink'
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
  fetch: <TResponse>(
    type: string,
    data?: MessageData,
    options?: {
      signal?: AbortSignal
      suppressWarnings?: boolean
      responseTimeout?: number
    },
  ) => Promise<TResponse>
}

/**
 * @internal
 * Hook to wrap a Comlink node in a React hook.
 * Our store functionality takes care of the lifecycle of the node,
 * as well as sharing a single node between invocations if they share the same name.
 *
 * Generally not to be used directly, but to be used as a dependency of
 * Comlink-powered hooks like `useManageFavorite`.
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

  const fetch = useCallback(
    <TResponse>(
      type: string,
      data?: MessageData,
      fetchOptions?: {
        responseTimeout?: number
        signal?: AbortSignal
        suppressWarnings?: boolean
      },
    ): Promise<TResponse> => {
      if (!nodeRef.current) {
        throw new Error('Cannot fetch before connection is established')
      }
      return nodeRef.current?.fetch(type, data, fetchOptions ?? {}) as Promise<TResponse>
    },
    [],
  )
  return {
    sendMessage,
    fetch,
  }
}

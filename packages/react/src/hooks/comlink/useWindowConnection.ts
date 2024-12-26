import {getNodeSource, type WindowMessage} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Function to handle messages from the enclosing app or frame.
 * @public
 */
export type WindowMessageHandler<TMessage extends WindowMessage> = (data: TMessage['data']) => void

/**
 * Options for the useFrameConnection hook
 * @public
 */
export interface UseWindowConnectionOptions<TMessage extends WindowMessage> {
  name: string
  connectTo: string
  onMessage?: Record<TMessage['type'], WindowMessageHandler<TMessage>>
}

/**
 * Window connections manage connections to an enclosing app or frame
 * @public
 */
export interface WindowConnection<TMessage extends WindowMessage> {
  // get the data type for this specific message, e.g., {type: 'SEND_ROUTE', data: {route: string}}
  sendMessage: <TType extends TMessage['type']>(
    type: TType,
    data?: Extract<TMessage, {type: TType}>['data'],
  ) => void
}

/**
 * Window connections manage connections to an enclosing app or frame
 * via the Comlink API.
 * @public
 */
export function useWindowConnection<TMessage extends WindowMessage>(
  options: UseWindowConnectionOptions<TMessage>,
): WindowConnection<TMessage> {
  const {name, connectTo, onMessage} = options
  const instance = useSanityInstance()

  const {subscribe: subscribeToNode, getCurrent: getCurrentNode} = useMemo(
    () => getNodeSource(instance, {name, connectTo}),
    [instance, name, connectTo],
  )

  const node = useSyncExternalStore(subscribeToNode, getCurrentNode)

  useEffect(() => {
    if (onMessage) {
      const messageHandlers: Array<[string, WindowMessageHandler<TMessage>]> =
        Object.entries(onMessage)

      messageHandlers.forEach(([type, handler]) => {
        node?.on(type, (data) => {
          handler(data)
          return undefined
        })
      })
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

  return {
    sendMessage,
  }
}

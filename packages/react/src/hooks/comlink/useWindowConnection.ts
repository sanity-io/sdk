import {type MessageData, type NodeInput} from '@sanity/comlink'
import {
  type FrameMessage,
  getNodeState,
  type NodeState,
  type SanityInstance,
  type StateSource,
  type WindowMessage,
} from '@sanity/sdk'
import {useCallback, useEffect, useRef} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'
import {createStateSourceHook} from '../helpers/createStateSourceHook'

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

const useNodeState = createStateSourceHook({
  getState: getNodeState as (
    instance: SanityInstance,
    nodeInput: NodeInput,
  ) => StateSource<NodeState>,
  shouldSuspend: (instance: SanityInstance, nodeInput: NodeInput) =>
    getNodeState(instance, nodeInput).getCurrent() === undefined,
  suspender: (instance: SanityInstance, nodeInput: NodeInput) => {
    return firstValueFrom(getNodeState(instance, nodeInput).observable.pipe(filter(Boolean)))
  },
})

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
}: UseWindowConnectionOptions<TFrameMessage>): WindowConnection<TWindowMessage> {
  const {node} = useNodeState({name, connectTo})
  const messageUnsubscribers = useRef<(() => void)[]>([])
  const instance = useSanityInstance()

  useEffect(() => {
    if (onMessage) {
      Object.entries(onMessage).forEach(([type, handler]) => {
        const messageUnsubscribe = node.on(type, handler as WindowMessageHandler<TFrameMessage>)
        if (messageUnsubscribe) {
          messageUnsubscribers.current.push(messageUnsubscribe)
        }
      })
    }

    return () => {
      messageUnsubscribers.current.forEach((unsubscribe) => unsubscribe())
      messageUnsubscribers.current = []
    }
  }, [instance, name, onMessage, node])

  const sendMessage = useCallback(
    (type: TWindowMessage['type'], data?: Extract<TWindowMessage, {type: typeof type}>['data']) => {
      node.post(type, data)
    },
    [node],
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
      return node.fetch(type, data, fetchOptions ?? {}) as Promise<TResponse>
    },
    [node],
  )
  return {
    sendMessage,
    fetch,
  }
}

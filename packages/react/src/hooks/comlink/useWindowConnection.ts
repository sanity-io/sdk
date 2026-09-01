import {type MessageData, type NodeInput} from '@sanity/comlink'
import {type StateSource} from '@sanity/sdk'
import {
  type FrameMessage,
  getNodeState,
  type NodeState,
  type WindowMessage,
} from '@sanity/sdk/comlink'
import {use, useCallback, useEffect, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

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

const getNoNode = () => undefined
const subscribeToNoNode = () => () => {}

function useNodeState(nodeInput: NodeInput, enabled: boolean): NodeState | undefined {
  const instance = useSanityInstance()
  const source: StateSource<NodeState | undefined> | undefined = enabled
    ? getNodeState(instance, nodeInput)
    : undefined

  if (source && source.getCurrent() === undefined) {
    use(firstValueFrom(source.observable.pipe(filter(Boolean))))
  }

  return useSyncExternalStore(
    source?.subscribe ?? subscribeToNoNode,
    source?.getCurrent ?? getNoNode,
  )
}

function useWindowConnectionState<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>(
  {name, connectTo, onMessage}: UseWindowConnectionOptions<TFrameMessage>,
  enabled: boolean,
): WindowConnection<TWindowMessage> | undefined {
  const nodeState = useNodeState({name, connectTo}, enabled)
  const node = nodeState?.node

  useEffect(() => {
    if (!node || !onMessage) return undefined
    const unsubscribers = Object.entries(onMessage)
      .map(([type, handler]) => node.on(type, handler as WindowMessageHandler<TFrameMessage>))
      .filter((unsubscribe): unsubscribe is () => void => unsubscribe !== undefined)

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [node, onMessage])

  const sendMessage = useCallback(
    (type: TWindowMessage['type'], data?: Extract<TWindowMessage, {type: typeof type}>['data']) => {
      if (!node) throw new Error('Comlink is not connected')
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
      if (!node) return Promise.reject(new Error('Comlink is not connected'))
      return node.fetch(type, data, fetchOptions ?? {}) as Promise<TResponse>
    },
    [node],
  )

  return node ? {sendMessage, fetch} : undefined
}

/** Connects a component to a shared Comlink window node. @internal */
export function useWindowConnection<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>({
  name,
  connectTo,
  onMessage,
}: UseWindowConnectionOptions<TFrameMessage>): WindowConnection<TWindowMessage> {
  return useWindowConnectionState<TWindowMessage, TFrameMessage>(
    {name, connectTo, onMessage},
    true,
  ) as WindowConnection<TWindowMessage>
}

/** Returns a Comlink connection only while it is enabled. @internal */
export function useOptionalWindowConnection<
  TWindowMessage extends WindowMessage,
  TFrameMessage extends FrameMessage,
>(
  options: UseWindowConnectionOptions<TFrameMessage>,
  enabled: boolean,
): WindowConnection<TWindowMessage> | undefined {
  return useWindowConnectionState<TWindowMessage, TFrameMessage>(options, enabled)
}

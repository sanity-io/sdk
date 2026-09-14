import {requireDashboardMessageBus} from '@sanity/sdk/_internal'
import {
  type EventTopic,
  type MessageBusEmitOptions,
  type MessageBusEmitResult,
  type PayloadOf,
  type ReplyOf,
} from '@sanity/sdk/dashboard'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Emits a dashboard event topic, typed to the topic's payload and reply.
 * @public
 */
export type TopicEmitter<K extends EventTopic> = (
  ...args: PayloadOf<K> extends void
    ? [payload?: void, options?: MessageBusEmitOptions]
    : [payload: PayloadOf<K>, options?: MessageBusEmitOptions]
) => MessageBusEmitResult<ReplyOf<K>>

/**
 * Returns a stable function that emits a dashboard event topic.
 *
 * The event is sent immediately. Ignore the lazy result for fire-and-forget delivery, await it
 * inside `useTransition` to track a reply, or read it with React `use` to suspend. A reply
 * that fails (`NO_RESPONDER`, `TIMEOUT`, `ABORTED`) rejects the result; when read with `use`
 * that reaches the nearest error boundary, so pair the `Suspense` with one.
 *
 * @example Fire and forget
 * ```tsx
 * function ExpandPanel() {
 *   const setPanelMode = useEmit('panels.mode.set')
 *   return (
 *     <button onClick={() => setPanelMode({name: 'favorites', mode: 'full'})}>
 *       Expand
 *     </button>
 *   )
 * }
 * ```
 *
 * @example Await a reply with Suspense
 * ```tsx
 * function Session({request}: {request: MessageBusEmitResult<string>}) {
 *   use(request)
 *   return <p>Ready</p>
 * }
 *
 * function SessionAccordion() {
 *   const refreshToken = useEmit('auth.token.refresh')
 *   const [request, setRequest] = useState<MessageBusEmitResult<string> | null>(null)
 *
 *   return (
 *     <details
 *       onToggle={(event) => setRequest(event.currentTarget.open ? refreshToken() : null)}
 *     >
 *       <summary>Session</summary>
 *       <ErrorBoundary fallback={<p>Could not refresh</p>}>
 *         <Suspense fallback={<p>Refreshing...</p>}>
 *           {request && <Session request={request} />}
 *         </Suspense>
 *       </ErrorBoundary>
 *     </details>
 *   )
 * }
 * ```
 *
 * @public
 */
export function useEmit<K extends EventTopic>(topic: K): TopicEmitter<K> {
  const instance = useSanityInstance()
  const messageBus = requireDashboardMessageBus(instance, `emit topic "${topic}"`)
  return useCallback<TopicEmitter<K>>(
    (...args) => messageBus.emit(topic, ...args),
    [messageBus, topic],
  )
}

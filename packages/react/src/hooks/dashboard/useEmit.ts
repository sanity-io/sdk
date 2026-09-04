import {useMemo} from 'react'

import {type MessageBusEmitOptions, type MessageBusEmitResult} from '../../dashboard/messageBus/bus'
import {getDashboardMessageBus} from '../../dashboard/messageBus/client'
import {type EventTopic, type PayloadOf, type ReplyOf} from '../../dashboard/messageBus/topics'

type TopicEmitter<K extends EventTopic> = (
  ...args: PayloadOf<K> extends void
    ? [payload?: void, options?: MessageBusEmitOptions]
    : [payload: PayloadOf<K>, options?: MessageBusEmitOptions]
) => MessageBusEmitResult<ReplyOf<K>>

/**
 * Returns a stable function that emits a dashboard event topic.
 *
 * The event is sent immediately. Ignore the lazy result for fire-and-forget delivery, await it
 * inside `useTransition` to track a reply, or read it with React `use` to suspend.
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
 * @example Await a reply without Suspense
 * ```tsx
 * function SessionAccordion() {
 *   const refreshToken = useEmit('auth.token.refresh')
 *   const [isPending, startTransition] = useTransition()
 *
 *   return (
 *     <details
 *       onToggle={(event) => {
 *         if (event.currentTarget.open) {
 *           startTransition(async () => {
 *             await refreshToken()
 *           })
 *         }
 *       }}
 *     >
 *       <summary>Session</summary>
 *       <p>{isPending ? 'Refreshing...' : 'Ready'}</p>
 *     </details>
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
 *       <Suspense fallback={<p>Refreshing...</p>}>
 *         {request && <Session request={request} />}
 *       </Suspense>
 *     </details>
 *   )
 * }
 * ```
 *
 * @public
 */
export function useEmit<K extends EventTopic>(topic: K): TopicEmitter<K> {
  return useMemo(() => {
    const messageBus = getDashboardMessageBus()
    if (!messageBus) {
      throw new Error('useEmit must be used inside a dashboard application')
    }
    return (...args) => messageBus.emit(topic, ...args)
  }, [topic])
}

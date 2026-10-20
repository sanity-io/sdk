import {getWorkerClient} from '@sanity/sdk/_internal'
import {type MessageBusEmitOptions} from '@sanity/sdk/dashboard'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * What a worker takes and sends: the payload posted to it, its reply, and the messages it sends
 * back.
 * @public
 * @category Dashboard
 */
export interface WorkerTypes {
  payload: unknown
  reply: unknown
  message: unknown
}

/**
 * One of the application's workers, as {@link useWorker} returns it.
 * @public
 * @category Dashboard
 */
export interface WorkerClient<T extends WorkerTypes = WorkerTypes> {
  /**
   * Posts to the worker and resolves with its reply. Rejects with a `MessageBusError` whose `code`
   * is `NO_RESPONDER` when the worker isn't running, `TIMEOUT`, `ABORTED`, or `REFUSED` or
   * `HANDLER_THREW` when the worker refuses.
   */
  post(
    ...args: T['payload'] extends void
      ? [payload?: void, options?: MessageBusEmitOptions]
      : [payload: T['payload'], options?: MessageBusEmitOptions]
  ): Promise<T['reply']>
  /** Runs a handler for each message the worker sends, and returns a function that stops it. */
  subscribe(handler: (message: T['message']) => void): () => void
}

/**
 * Returns a client for one of the application's own workers, named by service. The client is
 * the same object for the same name, even across a render that suspended, so it can key caches.
 *
 * A worker's messages aren't stored, so a view that starts listening later misses earlier ones.
 * Listen first, then post for what you need. Have the worker send a message when it starts,
 * such as `welcome`, so views that are already listening post again.
 *
 * @example
 * ```tsx
 * import {useWorker} from '@sanity/sdk-react/dashboard'
 * import {useMemo} from 'react'
 * import {useObservable} from 'react-rx'
 * import {filter, Observable, scan, share, startWith, switchMap} from 'rxjs'
 *
 * type Feed = {payload: {feed: 'inbox'}; reply: Snapshot; message: FeedMessage}
 *
 * function Inbox() {
 *   const feed = useWorker<Feed>('feed')
 *   const inbox$ = useMemo(() => {
 *     const messages$ = new Observable<FeedMessage>((subscriber) =>
 *       feed.subscribe((message) => subscriber.next(message)),
 *     ).pipe(share())
 *     return messages$.pipe(
 *       filter((message) => message.type === 'welcome'),
 *       startWith(null),
 *       switchMap(() => feed.post({feed: 'inbox'})),
 *       switchMap((snapshot) => messages$.pipe(scan(apply, snapshot), startWith(snapshot))),
 *     )
 *   }, [feed])
 *   const inbox = useObservable(inbox$)
 *
 *   return <List items={inbox?.items ?? []} />
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useWorker<T extends WorkerTypes = WorkerTypes>(name: string): WorkerClient<T> {
  return getWorkerClient(useSanityInstance(), name) as WorkerClient<T>
}

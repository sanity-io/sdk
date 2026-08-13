import {type ListenEvent, type SanityClient} from '@sanity/client'
import {filter, map, Observable, share, switchMap, take} from 'rxjs'

import {buildCommentsListenQuery, buildCommentsQuery, LISTEN_OPTIONS} from './commentsConstants'
import {type StoredComment} from './types'

/** What the listener saw, in terms the store can apply. */
export type CommentsEvent =
  | {type: 'snapshot'; comments: StoredComment[]}
  | {type: 'appear'; comment: StoredComment}
  | {type: 'disappear'; commentId: string}
  | {type: 'update'; comment: StoredComment; transactionId: string}
  | {type: 'error'; error: unknown}

function toCommentsEvent(event: ListenEvent<StoredComment>): CommentsEvent | undefined {
  if (event.type !== 'mutation') return undefined

  if (event.transition === 'disappear') {
    return {type: 'disappear', commentId: event.documentId}
  }

  // `includeResult` is on, so a create or update carries the whole comment. An
  // event without one is nothing we can apply.
  if (!event.result) return undefined

  if (event.transition === 'appear') {
    return {type: 'appear', comment: event.result}
  }

  return {type: 'update', comment: event.result, transactionId: event.transactionId}
}

/**
 * Watches one document's comments: a snapshot on connect, then live changes.
 *
 * The Studio awaits its snapshot inside the event handler, which loses any
 * mutation that arrives while the fetch is in flight, because the older
 * snapshot overwrites it. Here the mutations that arrive during a fetch are
 * held and replayed straight after the snapshot, so nothing is dropped.
 *
 * A reconnect produces a fresh `welcome`, which cancels any fetch still running
 * and starts a new one. Reconnects emit nothing themselves: dropping the list
 * while reconnecting would only make readers suspend again for data we still
 * have.
 *
 * @internal
 */
export function observeComments(options: {
  client: SanityClient
  documentId: string
  documentVersionId?: string
}): Observable<CommentsEvent> {
  const {client, documentId, documentVersionId} = options

  const params = {
    documentId,
    ...(documentVersionId ? {documentVersionId} : {}),
  }

  const events$ = client.observable
    .listen<StoredComment>(buildCommentsListenQuery(documentVersionId), params, LISTEN_OPTIONS)
    .pipe(share())

  const mutations$ = events$.pipe(
    map(toCommentsEvent),
    filter((event): event is CommentsEvent => event !== undefined),
  )

  return events$.pipe(
    filter((event) => event.type === 'welcome'),
    switchMap(
      () =>
        new Observable<CommentsEvent>((observer) => {
          // Subscribe before the fetch starts so nothing between the two is missed.
          // The array only exists while the snapshot is in flight. Once flushed,
          // live mutations pass through without retaining their history.
          const buffered: CommentsEvent[] = []
          let snapshotReceived = false
          const mutationSubscription = mutations$.subscribe({
            next: (event) => {
              if (snapshotReceived) observer.next(event)
              else buffered.push(event)
            },
            error: (error: unknown) => observer.error(error),
          })

          const snapshotSubscription = client.observable
            .fetch<StoredComment[]>(buildCommentsQuery(documentVersionId), params, {
              tag: 'comments.list',
            })
            .pipe(take(1))
            .subscribe({
              next: (comments) => {
                observer.next({type: 'snapshot', comments})
                snapshotReceived = true
                for (const event of buffered) observer.next(event)
                buffered.length = 0
              },
              error: (error: unknown) => {
                observer.next({type: 'error', error})
                observer.complete()
              },
            })

          return () => {
            mutationSubscription.unsubscribe()
            snapshotSubscription.unsubscribe()
            buffered.length = 0
          }
        }),
    ),
  )
}

import {type ListenEvent, type QueryParams, type SanityClient} from '@sanity/client'
import {filter, Observable, switchMap, take} from 'rxjs'

import {buildSnapshotQuery} from './commentsConstants'
import {type StoredComment} from './types'

/** What the listener saw, in terms the store can apply. */
export type CommentsEvent =
  | {type: 'snapshot'; comments: StoredComment[]}
  | {type: 'appear'; comment: StoredComment}
  | {type: 'disappear'; commentId: string}
  | {type: 'update'; comment: StoredComment; transactionId: string}
  | {type: 'error'; error: unknown}

/**
 * Turns one listener event into what it means for this list.
 *
 * The listener carries every comment in the organization, so whether an event
 * is an arrival, a change, or a departure is a question about this list rather
 * than about the mutation: a comment that now matches the filter has appeared
 * here even if it was an edit, and one that no longer matches has left here
 * even though it still exists. `held` is the list as the server stream has it
 * so far, and is kept current as events are read.
 */
function toCommentsEvent(
  event: ListenEvent<StoredComment>,
  matches: (comment: StoredComment) => boolean,
  held: Set<string>,
): CommentsEvent | undefined {
  if (event.type !== 'mutation') return undefined

  // A delete carries no comment to test, and is a departure from every list.
  if (event.transition === 'disappear') {
    held.delete(event.documentId)
    return {type: 'disappear', commentId: event.documentId}
  }

  // `includeResult` is on, so a create or update carries the whole comment. An
  // event without one is nothing we can apply.
  if (!event.result) return undefined
  const comment = event.result

  if (!matches(comment)) {
    // Edited out of this list's filter. Never in it is the common case by far,
    // since most of what the listener carries belongs to other lists entirely.
    return held.delete(comment._id) ? {type: 'disappear', commentId: comment._id} : undefined
  }

  if (held.has(comment._id)) {
    return {type: 'update', comment, transactionId: event.transactionId}
  }

  held.add(comment._id)
  return {type: 'appear', comment}
}

/**
 * Watches one comment list: a snapshot on connect, then the changes to it.
 *
 * The listener is shared across every list in the organization, so this picks
 * out the events that belong to this one by testing each comment against the
 * list's own filter. The snapshot still comes from the server, because a filter
 * says which comments belong rather than which comments exist.
 *
 * The Studio awaits its snapshot inside the event handler, which loses any
 * mutation that arrives while the fetch is in flight, because the older
 * snapshot overwrites it. Here the mutations that arrive during a fetch are
 * held and read straight after the snapshot, so nothing is dropped. They are
 * held unread: what an event means depends on the list it lands in, and until
 * the snapshot says what that list holds there is no answer.
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
  events$: Observable<ListenEvent<StoredComment>>
  filter: string
  params: QueryParams
  matches: (comment: StoredComment) => boolean
}): Observable<CommentsEvent> {
  const {client, events$, filter: commentsFilter, params, matches} = options
  const {comments} = client.observable.collaboration

  return events$.pipe(
    filter((event) => event.type === 'welcome'),
    switchMap(
      () =>
        new Observable<CommentsEvent>((observer) => {
          // Subscribe before the fetch starts so nothing between the two is missed.
          // The array only exists while the snapshot is in flight. Once read,
          // live mutations pass through without retaining their history.
          const buffered: ListenEvent<StoredComment>[] = []
          let held: Set<string> | undefined

          const apply = (event: ListenEvent<StoredComment>, into: Set<string>) => {
            const commentsEvent = toCommentsEvent(event, matches, into)
            if (commentsEvent) observer.next(commentsEvent)
          }

          const mutationSubscription = events$.subscribe({
            next: (event) => {
              if (held) apply(event, held)
              else buffered.push(event)
            },
            error: (error: unknown) => observer.error(error),
          })

          const snapshotSubscription = comments
            .fetch<StoredComment[]>(buildSnapshotQuery(commentsFilter), params, {
              tag: 'comments.list',
            })
            .pipe(take(1))
            .subscribe({
              next: (snapshot) => {
                observer.next({type: 'snapshot', comments: snapshot})
                held = new Set(snapshot.map((comment) => comment._id))
                for (const event of buffered) apply(event, held)
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

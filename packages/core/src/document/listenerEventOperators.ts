import {type ListenEvent, type MutationEvent} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {defer, filter, type MonoTypeOperatorFunction, Observable} from 'rxjs'

import {setCleanupTimeout} from '../utils/setCleanupTimeout'

const DEDUPE_TTL = 120_000
const DEDUPE_MAX_ENTRIES = 1_000

/**
 * How long to hold an incomplete multi-document transaction (and the events
 * held behind it) before releasing everything anyway. Only reached when part
 * of a transaction is lost.
 */
const GROUP_FLUSH_DEADLINE = 30_000

/**
 * How many intervening events to hold behind an incomplete multi-document
 * transaction before giving up on grouping and releasing everything in
 * arrival order.
 */
const GROUP_MAX_HELD_EVENTS = 100

interface DedupeOptions {
  ttl?: number
  maxEntries?: number
}

/**
 * Drops mutation events that have already been observed, keyed by
 * `transactionId#documentId`. With `enableResume`, the listener replays
 * missed events after a reconnect on an at-least-once basis, so the same
 * event can be delivered twice. A duplicate would never chain onto the
 * current base revision and would clog the sequencing buffer until it
 * overflows into an `OutOfSyncError`.
 *
 * Seen keys expire after `ttl` milliseconds and the cache is capped at
 * `maxEntries`, evicting the oldest entries first.
 *
 * @internal
 */
export function dedupeListenerEvents(
  options?: DedupeOptions,
): MonoTypeOperatorFunction<ListenEvent<SanityDocument>> {
  const {ttl = DEDUPE_TTL, maxEntries = DEDUPE_MAX_ENTRIES} = options ?? {}

  return (source) =>
    defer(() => {
      // insertion-ordered map of dedupe key -> expiry timestamp
      const seen = new Map<string, number>()

      return source.pipe(
        filter((event) => {
          if (event.type !== 'mutation') return true

          const key = `${event.transactionId}#${event.documentId}`
          const now = Date.now()

          const expiry = seen.get(key)
          if (expiry !== undefined && expiry > now) return false

          seen.delete(key)
          seen.set(key, now + ttl)

          for (const [existingKey, existingExpiry] of seen) {
            if (seen.size <= maxEntries && existingExpiry > now) break
            seen.delete(existingKey)
          }

          return true
        }),
      )
    })
}

interface GroupTransactionEventsOptions {
  flushDeadline?: number
  maxHeldEvents?: number
}

/**
 * Buffers the mutation events of multi-document transactions (e.g. a publish
 * touching both the draft and the published document) until every event of
 * the transaction has arrived, then emits them contiguously. Without this,
 * a rebase can run between the two halves of a transaction and observe the
 * dataset in a state that never existed on the server (draft deleted, but
 * published not yet updated).
 *
 * The backend's streaming listener pipeline delivers a transaction's events
 * contiguously and in order, but the legacy pipeline can interleave
 * concurrent transactions. So while a multi-document transaction is
 * incomplete, mutation events from other transactions are held (in arrival
 * order) rather than emitted, and released right after the transaction
 * completes; released events are re-processed so a held multi-document
 * transaction is grouped too. Per-document `previousRev` sequencing
 * downstream tolerates the reordering this introduces.
 *
 * Escape hatches so a lost event degrades to ungrouped delivery instead of
 * stalling the stream: everything is released in arrival order when a
 * non-mutation event (e.g. reconnect/welcome) arrives, when more than
 * `maxHeldEvents` are held, or after `flushDeadline` milliseconds.
 * Single-event transactions pass through untouched when nothing is buffered.
 *
 * @internal
 */
export function groupTransactionEvents(
  options?: GroupTransactionEventsOptions,
): MonoTypeOperatorFunction<ListenEvent<SanityDocument>> {
  const {flushDeadline = GROUP_FLUSH_DEADLINE, maxHeldEvents = GROUP_MAX_HELD_EVENTS} =
    options ?? {}

  return (source) =>
    new Observable<ListenEvent<SanityDocument>>((subscriber) => {
      interface OpenTransaction {
        transactionId: string
        events: MutationEvent[]
        total: number
        timer: ReturnType<typeof setTimeout>
      }

      let open: OpenTransaction | null = null
      let held: MutationEvent[] = []

      // emits the open transaction's events (complete or not) without
      // releasing the held queue; callers decide what happens to `held`
      const closeOpen = () => {
        if (!open) return
        clearTimeout(open.timer)
        const {events} = open
        open = null
        for (const event of events) subscriber.next(event)
      }

      // re-processes the held queue so a held multi-document transaction
      // gets grouped in turn. processing may open a new transaction and top
      // up a new held queue; each drain only touches its own snapshot, so
      // this terminates
      const releaseHeld = () => {
        const queue = held
        held = []
        for (const event of queue) processEvent(event)
      }

      const releaseEverything = () => {
        closeOpen()
        const queue = held
        held = []
        for (const event of queue) subscriber.next(event)
      }

      const processEvent = (event: ListenEvent<SanityDocument>) => {
        if (event.type !== 'mutation') {
          // connection-level events (welcome/welcomeback/reset/reconnect)
          // reset the world downstream; release everything before them
          releaseEverything()
          subscriber.next(event)
          return
        }

        const isMultiDocument = (event.transactionTotalEvents ?? 0) > 1

        if (!open) {
          if (!isMultiDocument) {
            subscriber.next(event)
            return
          }
          // isMultiDocument guarantees total >= 2, so a freshly opened
          // transaction is always incomplete; completion is checked when
          // subsequent events of the same transaction arrive below
          open = {
            transactionId: event.transactionId,
            events: [event],
            total: event.transactionTotalEvents,
            timer: setCleanupTimeout(() => {
              closeOpen()
              releaseHeld()
            }, flushDeadline),
          }
          return
        }

        if (event.transactionId === open.transactionId) {
          open.events.push(event)
          if (open.events.length >= open.total) {
            closeOpen()
            releaseHeld()
          }
          return
        }

        // an event from another transaction while one is incomplete: hold it
        // (legacy listener pipeline interleaving) instead of giving up on the
        // open transaction
        held.push(event)
        if (held.length > maxHeldEvents) releaseEverything()
      }

      const subscription = source.subscribe({
        next: processEvent,
        error: (error) => {
          releaseEverything()
          subscriber.error(error)
        },
        complete: () => {
          releaseEverything()
          subscriber.complete()
        },
      })

      return () => {
        if (open) clearTimeout(open.timer)
        open = null
        held = []
        subscription.unsubscribe()
      }
    })
}

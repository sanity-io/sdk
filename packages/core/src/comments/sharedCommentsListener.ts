import {type ListenEvent, type QueryParams, type SanityClient} from '@sanity/client'
import {merge, type Observable, partition, ReplaySubject, share, switchMap, tap} from 'rxjs'

import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {UPSTREAM_CLOSE_DELAY_MS} from '../store/createStoreInstance'
import {cleanupTimer} from '../utils/setCleanupTimeout'
import {
  observeCommentsClient,
  observeCommentsOrganizationId,
  toCommentsResourceKey,
} from './commentsClient'
import {buildListenQuery, LISTEN_OPTIONS, TYPE_FILTER} from './commentsConstants'
import {type StoredComment} from './types'

/** Every comment mutation for the resource, as the listener reports it. */
type CommentsListener = Observable<ListenEvent<StoredComment>>

/**
 * One listener per resource, for as long as something is reading comments from
 * it.
 *
 * Keyed by instance so the listeners die with it, and by the same resource
 * identity sent to the comments API. The entry is dropped once the last reader
 * has gone, so a later one opens a fresh connection rather than an inert stream.
 */
const listeners = new WeakMap<SanityInstance, Map<string, CommentsListener>>()

function createListener(
  instance: SanityInstance,
  resource: DocumentResource,
  organizationId: string,
  onClosed: () => void,
): CommentsListener {
  const events$ = observeCommentsClient(instance, {resource, organizationId}).pipe(
    switchMap(
      (client) =>
        client.observable.collaboration.comments.listen(
          buildListenQuery(TYPE_FILTER),
          {},
          LISTEN_OPTIONS,
        ) as CommentsListener,
    ),
    // One connection however many lists are reading, which is the point of all
    // of this. `partition` below subscribes twice on its own.
    share(),
  )

  const [welcome$, mutations$] = partition(events$, (event) => event.type === 'welcome')

  return merge(
    // A list that starts reading after the connection is up still has to fetch
    // its first snapshot, and the welcome is what sets that off. Held past the
    // last reader for the same reason the connection is: a list that comes
    // straight back should not have to wait for a reconnect.
    welcome$.pipe(
      share({
        connector: () => new ReplaySubject<ListenEvent<StoredComment>>(1),
        resetOnComplete: false,
        resetOnRefCountZero: () => cleanupTimer(UPSTREAM_CLOSE_DELAY_MS).pipe(tap(onClosed)),
      }),
    ),
    mutations$,
  )
}

/**
 * The resource's comment listener, opening one if it is not already there.
 *
 * Every comment for the resource comes through it. Narrowing is left to each
 * list, which is what lets one connection serve all of that resource's lists.
 *
 * @internal
 */
export function getSharedCommentsListener(
  instance: SanityInstance,
  resource: DocumentResource,
): CommentsListener {
  const resourceKey = toCommentsResourceKey(resource)
  return observeCommentsOrganizationId(instance, resource).pipe(
    switchMap((organizationId) => {
      // The organization is part of the key so that a project moving to
      // another organization opens a listener for it rather than reusing one
      // opened with the old one.
      const key = `${resourceKey}|${organizationId}`
      let byResource = listeners.get(instance)
      if (!byResource) {
        byResource = new Map()
        listeners.set(instance, byResource)
      }

      const existing = byResource.get(key)
      if (existing) return existing

      const registry = byResource
      const listener = createListener(instance, resource, organizationId, () =>
        registry.delete(key),
      )
      registry.set(key, listener)
      return listener
    }),
  )
}

/**
 * A listener for one list alone, filtered by the server.
 *
 * The fallback for a filter the local evaluator cannot answer for, which is
 * what the shared listener needs to tell one list's comments from another's.
 * Such a list costs a connection of its own and sees new comments only once
 * the server sends them, which is where every list stood before sharing.
 *
 * @internal
 */
export function getDedicatedCommentsListener(
  client: SanityClient,
  filter: string,
  params: QueryParams,
): CommentsListener {
  return (
    client.observable.collaboration.comments.listen(
      buildListenQuery(filter),
      params,
      LISTEN_OPTIONS,
    ) as CommentsListener
  ).pipe(share())
}

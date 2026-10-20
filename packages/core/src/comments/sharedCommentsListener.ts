import {type ListenEvent, type QueryParams, type SanityClient} from '@sanity/client'
import {merge, type Observable, partition, ReplaySubject, share, switchMap, tap} from 'rxjs'

import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {UPSTREAM_CLOSE_DELAY_MS} from '../store/createStoreInstance'
import {cleanupTimer} from '../utils/setCleanupTimeout'
import {observeCommentsClient, observeCommentsOrganizationId} from './commentsClient'
import {buildListenQuery, LISTEN_OPTIONS, TYPE_FILTER} from './commentsConstants'
import {type StoredComment} from './types'

/** Every comment mutation in the organization, as the listener reports it. */
type CommentsListener = Observable<ListenEvent<StoredComment>>

/**
 * One listener per organization, for as long as something is reading comments
 * from it.
 *
 * Keyed by instance so the listeners die with it, and by organization because
 * that is what a listener covers. The comments API routes reads and listens by
 * organization and drops the `resourceType`/`resourceId` the client sends, then
 * filters by the comment groups the caller belongs to. A listener opened on one
 * dataset's client therefore already carries every comment in the organization
 * the caller can read, and one per dataset would only carry the same stream
 * again. The entry is dropped once the last reader has gone, so a later one
 * opens a fresh connection rather than an inert stream.
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
 * The organization's comment listener, opening one if it is not already there.
 *
 * Every comment in the organization comes through it, including comments on
 * canvases and on documents in other projects. Narrowing is left to each list,
 * which is what lets one connection serve all of them. Document lists match on
 * `target.document._ref`, which names the dataset, so each stays on its own
 * resource's comments, and would still if the API ever began to honour the
 * resource on a listen.
 *
 * The resource only supplies the client and the organization to resolve. Which
 * resource got there first does not change what the listener carries.
 *
 * @internal
 */
export function getSharedCommentsListener(
  instance: SanityInstance,
  resource: DocumentResource,
): CommentsListener {
  return observeCommentsOrganizationId(instance, resource).pipe(
    switchMap((organizationId) => {
      let byOrganization = listeners.get(instance)
      if (!byOrganization) {
        byOrganization = new Map()
        listeners.set(instance, byOrganization)
      }

      const existing = byOrganization.get(organizationId)
      if (existing) return existing

      const registry = byOrganization
      const listener = createListener(instance, resource, organizationId, () =>
        registry.delete(organizationId),
      )
      registry.set(organizationId, listener)
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

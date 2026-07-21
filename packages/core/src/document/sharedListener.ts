import {type ListenEvent, type SanityDocument} from '@sanity/client'
import {createDocumentLoaderFromClient} from '@sanity/mutate/_unstable_store'
import {
  first,
  map,
  merge,
  Observable,
  partition,
  share,
  shareReplay,
  Subject,
  switchMap,
  takeUntil,
} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DocumentResource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {dedupeListenerEvents, groupTransactionEvents} from './listenerEventOperators'

const API_VERSION = 'v2025-05-06'

export interface SharedListener {
  events: Observable<ListenEvent<SanityDocument>>
  dispose: () => void
}

export function createSharedListener(
  instance: SanityInstance,
  resource?: DocumentResource,
): SharedListener {
  const dispose$ = new Subject<void>()
  const events$ = getClientState(instance, {
    apiVersion: API_VERSION,
    resource,
  }).observable.pipe(
    switchMap((client) =>
      // TODO: it seems like the client.listen method is not emitting disconnected
      // events. this is important to ensure we have an up to date version of the
      // doc. probably should introduce our own events for when the user goes offline
      client.listen(
        '*',
        {},
        {
          // with `enableResume`, a reconnect replays the events missed while
          // offline (emitting `welcomeback`) instead of forcing a refetch of
          // every subscribed document. when the backend cannot resume, it
          // emits `welcome` or `reset`, both of which trigger a refetch
          events: ['mutation', 'welcome', 'welcomeback', 'reconnect', 'reset'],
          enableResume: true,
          includeResult: false,
          // the document store handles version documents, so we need to include all versions
          includeAllVersions: true,
          tag: 'document-listener',
          // // from manual testing, it seems like mendoza patches may be
          // // causing some ambiguity/wonkiness
          // includeMutations: false,
          // effectFormat: 'mendoza',
        },
      ),
    ),
    // resumed events are delivered at-least-once, so drop replayed duplicates
    dedupeListenerEvents(),
    // hold multi-document transactions (e.g. publish) until complete so
    // per-document processing never observes half a transaction
    groupTransactionEvents(),
    takeUntil(dispose$),
    share(),
  )

  const [welcome$, mutation$] = partition(events$, (e) => e.type === 'welcome')

  return {
    events: merge(
      // we replay the welcome event because that event kicks off fetching the document
      welcome$.pipe(shareReplay(1)),
      mutation$,
    ),
    dispose: () => dispose$.next(),
  }
}

export function createFetchDocument(instance: SanityInstance, resource?: DocumentResource) {
  return function (documentId: string): Observable<SanityDocument | null> {
    return getClientState(instance, {
      apiVersion: API_VERSION,
      resource,
    }).observable.pipe(
      switchMap((client) => {
        // creates a observable request to the /doc/{documentId} endpoint for a given document id
        // should work across all kinds of document IDs (drafts.**, version.**., etc.)
        const loadDocument = createDocumentLoaderFromClient(client)
        return loadDocument(documentId)
      }),
      map((result) => {
        if (!result.accessible) {
          if (result.reason === 'existence') return null
          throw new Error(`Document with ID \`${documentId}\` is inaccessible due to permissions.`)
        }
        return result.document as SanityDocument
      }),
      first(),
    )
  }
}

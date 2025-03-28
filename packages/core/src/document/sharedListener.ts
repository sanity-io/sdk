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
import {type SanityInstance} from '../store/createSanityInstance'

const API_VERSION = 'vX'

export interface SharedListener {
  events: Observable<ListenEvent<SanityDocument>>
  dispose: () => void
}

export function createSharedListener(instance: SanityInstance): SharedListener {
  const dispose$ = new Subject<void>()
  const events$ = getClientState(instance, {
    apiVersion: API_VERSION,
  }).observable.pipe(
    switchMap((client) =>
      // TODO: it seems like the client.listen method is not emitting disconnected
      // events. this is important to ensure we have an up to date version of the
      // doc. probably should introduce our own events for when the user goes offline
      client.listen(
        '*',
        {},
        {
          events: ['mutation', 'welcome', 'reconnect'],
          includeResult: false,
          tag: 'document-listener',
          // // from manual testing, it seems like mendoza patches may be
          // // causing some ambiguity/wonkiness
          // includeMutations: false,
          // effectFormat: 'mendoza',
        },
      ),
    ),
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

export function createFetchDocument(instance: SanityInstance) {
  return function (documentId: string): Observable<SanityDocument | null> {
    return getClientState(instance, {apiVersion: API_VERSION}).observable.pipe(
      switchMap((client) => {
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

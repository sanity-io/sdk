import {type ListenEvent, type SanityClient, type SanityDocument} from '@sanity/client'
import {createDocumentLoaderFromClient} from '@sanity/mutate/_unstable_store'
import {first, map, merge, Observable, partition, share, shareReplay, switchMap} from 'rxjs'

import {type ClientOptions} from '../client/actions/getClient'
import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {type DatasetResourceId} from '../documentList/documentListStore'
import {type SanityInstance} from '../instance/types'

const API_VERSION = 'vX'

export function createSharedListener(
  instance: SanityInstance,
  options: ClientOptions,
): Observable<ListenEvent<SanityDocument>> {
  const client$ = new Observable<SanityClient>((observer) =>
    getSubscribableClient(instance, {
      apiVersion: API_VERSION,
      projectId: options.projectId,
      dataset: options.dataset,
    }).subscribe(observer),
  )

  // TODO: it seems like the client.listen method is not emitting disconnected
  // events. this is important to ensure we have an up to date version of the
  // doc. probably should introduce our own events for when the user goes offline
  const events$ = client$.pipe(
    switchMap((client) =>
      client.listen(
        '*',
        {},
        {
          events: ['mutation', 'welcome', 'reconnect'],
          includeResult: false,
          tag: 'sdk.document-listener',
          // // from manual testing, it seems like mendoza patches may be
          // // causing some ambiguity/wonkiness
          // includeMutations: false,
          // effectFormat: 'mendoza',
        },
      ),
    ),
    share(),
  )

  const [welcome$, mutation$] = partition(events$, (e) => e.type === 'welcome')
  return merge(
    // we replay the welcome event because that event kicks off fetching the document
    welcome$.pipe(shareReplay(1)),
    mutation$,
  )
}

export function createFetchDocument(instance: SanityInstance) {
  const clients = new Map<DatasetResourceId, Observable<SanityClient>>()
  const getClient = (datasetResourceId: DatasetResourceId) => {
    if (!clients.has(datasetResourceId)) {
      const newClient$ = new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {
          apiVersion: API_VERSION,
          projectId: 'ppsg7ml5', // TODO: support multiple resources
          dataset: 'test',
        }).subscribe(observer),
      )
      clients.set(datasetResourceId, newClient$)
    }
    return clients.get(datasetResourceId)!
  }

  // const client$ = new Observable<SanityClient>((observer) =>
  //   getSubscribableClient(instance, {
  //     apiVersion: API_VERSION,
  //     projectId: 'ppsg7ml5', // TODO: support multiple resources
  //     dataset: 'test',
  //   }).subscribe(observer),
  // )

  return function (
    documentId: string,
    datasetResourceId: DatasetResourceId,
  ): Observable<SanityDocument | null> {
    const client$ = getClient(datasetResourceId)
    return client$.pipe(
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

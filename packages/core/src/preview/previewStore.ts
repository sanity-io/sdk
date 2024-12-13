import {SanityClient, type SyncTag} from '@sanity/client'
import {debounce} from 'lodash-es'
import {
  distinctUntilChanged,
  filter,
  firstValueFrom,
  Observable,
  type Observer,
  type Subscribable,
  switchMap,
} from 'rxjs'

import {getClient} from '../client/getClient'
import {getSubscribableClient} from '../client/getSubscribableClient'
import type {DocumentHandle} from '../documentList/documentListStore'
import type {SanityInstance} from '../instance/types'
import {
  type GetPreviewOptions,
  type PreviewEventsOptions,
  type PreviewStore,
  type PreviewValue,
  type ResolvePreviewOptions,
  type ValuePending,
} from './types'

interface BatchInfo {
  // Map of document IDs to their handles, aggregated for batched fetching
  documents: Map<string, DocumentHandle>
  // Sync tags associated with the batched documents for re-fetch coordination
  syncTags: SyncTag[]
  // The last known live event ID used to refine subsequent fetches
  lastLiveEventId?: string
  // AbortController for managing in-flight requests for the batch
  abortController?: AbortController
}

interface DocumentState {
  // The document's type
  type: string
  // The current preview value for the document, if available
  value: PreviewValue | null
  // Whether a fetch is currently pending for this document
  pending: boolean
  // A set of observers subscribed to preview value updates for this document
  observers: Set<Observer<ValuePending<PreviewValue>>>
}

/**
 * @internal
 * Represents the delay used to batch preview fetches for efficiency.
 */
export const BATCH_DEBOUNCE_TIME = 50
const API_VERSION = 'vX'

/**
 * @internal
 * Creates and returns a preview store instance, which manages fetching and streaming
 * preview values for documents. This store coordinates batched fetching of
 * preview data, listens to live content API events to keep previews in sync, and
 * provides methods to subscribe to updates, resolve current preview values, and
 * retrieve cached previews.
 */
export function createPreviewStore(instance: SanityInstance): PreviewStore {
  const client$ = new Observable<SanityClient>((observer) => {
    observer.next(getClient({apiVersion: API_VERSION}, instance))
    const subscription = getSubscribableClient({apiVersion: API_VERSION}, instance).subscribe(
      observer,
    )
    return () => subscription.unsubscribe()
  }).pipe(distinctUntilChanged())

  // State per document ID
  const documentStates = new Map<string, DocumentState>()
  function getDocumentState({_id, _type}: DocumentHandle) {
    const cached = documentStates.get(_id)
    if (cached) return cached

    const documentState: DocumentState = {
      observers: new Set(),
      pending: false,
      type: _type,
      value: null,
    }
    documentStates.set(_id, documentState)
    return documentState
  }

  // Batches per document type
  const batches = new Map<string, BatchInfo>() // Keyed by document type
  function getBatch(documentType: string) {
    const cached = batches.get(documentType)
    if (cached) return cached

    const batch: BatchInfo = {
      documents: new Map(),
      syncTags: [],
      lastLiveEventId: undefined,
    }
    batches.set(documentType, batch)
    return batch
  }

  // Subscribe to the live content API
  const liveSubscription = client$
    .pipe(
      switchMap((client) =>
        client.live.events({includeDrafts: !!client.config().token, tag: 'sdk.previewStore'}),
      ),
    )
    .subscribe((event) => {
      if (event.type !== 'message') return

      const eventId = event.id

      // Check each batch to see if the sync tags match
      for (const batch of batches.values()) {
        if (batch.syncTags.some((tag) => event.tags.includes(tag))) {
          // Update batch's lastLiveEventId
          batch.lastLiveEventId = eventId
          // Schedule re-fetch of the batch
          const docs = Array.from(batch.documents.values())
          scheduleFetch(docs)
        }
      }
    })

  function getPreviewProjection(_docType: string): string {
    // TODO: Implement logic to get the GROQ projection for the document type's
    // preview. This should match the user's schema configuration for previews
    // {"type": "image-asset", "url": image.asset->url}
    return '"title": coalesce(name, title, "Untitled"), "subtitle": coalesce(subtitle, description, _id), "media": select(image.asset->url == null => null, {"type": "image-asset", "url": image.asset->url})'
  }

  function scheduleFetch(documents: DocumentHandle[]) {
    let hasNewFetches = false

    for (const doc of documents) {
      const {_id, _type} = doc
      const docState = getDocumentState(doc)

      if (!docState.pending) {
        docState.pending = true
        hasNewFetches = true
        notifyObservers(docState)
      }

      // Get or create batch for the document type
      const batch = getBatch(_type)
      batch.documents.set(_id, doc)
    }

    if (hasNewFetches) {
      fetchBatches()
    }
  }

  function notifyObservers(docState: DocumentState) {
    for (const observer of docState.observers) {
      observer.next([docState.value, docState.pending])
    }
  }

  const fetchBatches = debounce(() => {
    for (const [docType, batch] of batches) {
      const docs = Array.from(batch.documents.values())

      // Before starting the new fetch, cancel any previous in-flight request for this batch
      batch.abortController?.abort()

      // Create a new AbortController for this fetch
      const abortController = new AbortController()
      batch.abortController = abortController

      const ids = docs.map((doc) => doc._id)
      const projection = getPreviewProjection(docType)
      const query = `*[_id in $__ids]{_id, _type, ${projection}}`
      const params = {__ids: ids}

      firstValueFrom(
        client$.pipe(
          switchMap((client) =>
            client.observable.fetch<Array<DocumentHandle & PreviewValue>>(query, params, {
              filterResponse: false,
              lastLiveEventId: batch.lastLiveEventId,
              signal: abortController.signal,
            }),
          ),
        ),
      )
        .then((res) => {
          const result = res.result.reduce<Map<string, DocumentHandle & PreviewValue>>(
            (acc, doc) => {
              acc.set(doc._id, doc)
              return acc
            },
            new Map(),
          )
          const syncTags = res.syncTags || []
          batch.syncTags = syncTags

          for (const doc of docs) {
            const docState = getDocumentState(doc)
            const docResult = result.get(doc._id)

            docState.value = docResult
              ? {title: docResult.title, subtitle: docResult.subtitle, media: docResult.media}
              : null
            docState.pending = false

            notifyObservers(docState)
          }
        })
        .catch((error) => {
          // Request was aborted; no need to notify observers as a new fetch is likely scheduled
          if (error.name === 'AbortError') return

          // TODO: handle errors
          // eslint-disable-next-line no-console
          console.error('Error fetching previews:', error)

          // Set pending to false and notify observers
          for (const doc of docs) {
            const docState = getDocumentState(doc)
            docState.pending = false
            notifyObservers(docState)
          }
        })
    }
  }, BATCH_DEBOUNCE_TIME)

  function events({document}: PreviewEventsOptions): Subscribable<ValuePending<PreviewValue>> {
    return new Observable<ValuePending<PreviewValue>>((observer) => {
      const docState = getDocumentState(document)
      docState.observers.add(observer)

      // Schedule fetch if not already pending
      if (!docState.pending) {
        scheduleFetch([document])
      }

      return () => {
        docState.observers.delete(observer)
        if (docState.observers.size === 0) {
          const batch = getBatch(docState.type)
          batch.documents.delete(document._id)
          docState.pending = false
          notifyObservers(docState)

          // TODO: check if batch is empty and delete it
        }
      }
    })
  }

  async function resolvePreview({document}: ResolvePreviewOptions): Promise<PreviewValue> {
    const [previewValue] = await firstValueFrom(
      new Observable<ValuePending<PreviewValue>>((observer) => {
        const subscription = events({document}).subscribe(observer)
        return () => subscription.unsubscribe()
      }).pipe(filter((valuePending): valuePending is [PreviewValue, boolean] => !!valuePending[0])),
    )

    return previewValue
  }

  // These are here to ensure that `getPreview` always returns the same tuple
  // so that `useSyncExternalStore` down stream doesn't cause infinite renders
  const previewCache = new WeakMap<
    object,
    [ValuePending<PreviewValue>, ValuePending<PreviewValue>]
  >()
  const stableNullTrue: ValuePending<PreviewValue> = [null, true]
  const stableNullFalse: ValuePending<PreviewValue> = [null, false]

  function getPreview({document}: GetPreviewOptions): ValuePending<PreviewValue> {
    const docState = getDocumentState(document)

    if (!docState.value) {
      if (docState.pending) return stableNullTrue
      return stableNullFalse
    }

    const cached = previewCache.get(docState.value)
    if (cached) {
      if (docState.pending) return cached[0]
      return cached[1]
    }

    const pendingTuple: ValuePending<PreviewValue> = [docState.value, true]
    const notPendingTuple: ValuePending<PreviewValue> = [docState.value, false]

    previewCache.set(docState.value, [pendingTuple, notPendingTuple])

    if (docState.pending) return pendingTuple
    return notPendingTuple
  }

  function clearCache() {
    documentStates.clear()
    batches.clear()
  }

  function dispose() {
    liveSubscription.unsubscribe()
  }

  return {
    events,
    resolvePreview,
    getPreview,
    clearCache,
    dispose,
  }
}

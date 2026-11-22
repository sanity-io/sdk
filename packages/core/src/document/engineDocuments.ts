import {type Action as ClientAction, type SanityClient} from '@sanity/client'
import {
  createDocumentSync,
  type DocumentSync,
  type ListenEvent,
  type PatchOps,
  type Transport,
} from '@sanity/document-sync'
import {DocumentId, getPublishedId, isDraftId, isVersionId} from '@sanity/id-utils'
import {distinctUntilChanged, filter, firstValueFrom, forkJoin, map, type Subscription} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DocumentHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type BoundResourceKey} from '../store/createActionBinder'
import {type StoreContext} from '../store/defineStore'
import {type ResolveDocument} from '../typegen/resolve'
import {type Action} from './actions'
import {API_VERSION} from './documentConstants'
import {type DocumentStoreState} from './documentStore'

// Prototype for `experimental_documentSync`: one `@sanity/document-sync` engine per document
// (published plus draft), kept in `DocumentStoreState.engines` by published id.

/**
 * The engine's transport over the store's own connections: snapshots from `fetchDocument`,
 * events from the shared listener (one connection for every document), and writes through
 * the Actions API.
 */
function createStoreTransport(
  context: StoreContext<DocumentStoreState, BoundResourceKey>,
): Transport {
  const {state, instance, key} = context
  const {sharedListener, fetchDocument} = state.get()
  const client$ = getClientState(instance, {
    apiVersion: API_VERSION,
    resource: key.resource,
  }).observable
  return {
    fetch: (ids) => firstValueFrom(forkJoin(ids.map((id) => fetchDocument(id)))),
    listen(ids, onEvent) {
      const subscription = sharedListener.events
        .pipe(filter((event) => event.type !== 'mutation' || ids.includes(event.documentId)))
        .subscribe((event) => onEvent(event as ListenEvent))
      return () => subscription.unsubscribe()
    },
    submit: async ({transactionId, actions}) => {
      const client: SanityClient = await firstValueFrom(client$)
      await client.action(actions as ClientAction[], {
        transactionId,
        skipCrossDatasetReferenceValidation: true,
        tag: 'document.action',
      })
    },
  }
}

/** Published ids of the documents with subscribers, leaving out release versions. */
function enginePublishedIds(documentStates: DocumentStoreState['documentStates']): string[] {
  const ids = Object.keys(documentStates).filter((id) => !isVersionId(DocumentId(id)))
  return [
    ...new Set(ids.map((id) => (isDraftId(DocumentId(id)) ? getPublishedId(DocumentId(id)) : id))),
  ]
}

/**
 * Keeps one engine per subscribed document while `experimental_documentSync` is on. Each engine
 * change bumps `engineChanges`, so selectors that read the engine run again.
 */
export function subscribeToSubscriptionsAndRunEngines(
  context: StoreContext<DocumentStoreState, BoundResourceKey>,
): Subscription {
  const {state, instance} = context
  const transport = createStoreTransport(context)
  const cleanups = new Map<string, () => void>()
  const subscription = state.observable
    .pipe(
      filter(() => !!instance.config.experimental_documentSync),
      map((s) => enginePublishedIds(s.documentStates).sort().join(',')),
      distinctUntilChanged(),
    )
    .subscribe((joined) => {
      const ids = joined ? joined.split(',') : []
      for (const id of ids) {
        if (cleanups.has(id)) continue
        const sync = createDocumentSync({documentId: id, transport})
        const unsubscribe = sync.subscribe(() => {
          state.set('engineChanged', (prev) => ({engineChanges: prev.engineChanges + 1}))
        })
        cleanups.set(id, () => {
          unsubscribe()
          sync.dispose()
        })
        state.set('addEngine', (prev) => ({engines: {...prev.engines, [id]: sync}}))
      }
      for (const [id, cleanup] of cleanups) {
        if (ids.includes(id)) continue
        cleanup()
        cleanups.delete(id)
        state.set('removeEngine', (prev) => {
          const {[id]: _removed, ...engines} = prev.engines
          return {engines}
        })
      }
    })
  subscription.add(() => cleanups.forEach((cleanup) => cleanup()))
  return subscription
}

/** The ready engine for a handle's document, or `undefined` when the engine does not handle it. */
export function engineForHandle(
  state: DocumentStoreState,
  handle: Pick<DocumentHandle, 'documentId' | 'liveEdit' | 'perspective'>,
): DocumentSync | undefined {
  // The engine handles a published document and its draft; liveEdit and release versions stay
  // on the transaction queue.
  if (handle.liveEdit || isReleasePerspective(handle.perspective)) return undefined
  const engine = state.engines[getPublishedId(DocumentId(handle.documentId))]
  return engine?.remote() === undefined ? undefined : engine
}

/** The engine's local view for a handle, or `undefined` when the engine does not handle it. */
export function engineLocalDocument(
  state: DocumentStoreState,
  handle: Pick<DocumentHandle, 'documentId' | 'liveEdit' | 'perspective'>,
): ResolveDocument | null | undefined {
  const engine = engineForHandle(state, handle)
  return engine ? (engine.local() as ResolveDocument | null) : undefined
}

type EngineAction = Extract<
  Action,
  {type: 'document.edit' | 'document.publish' | 'document.discard'}
>

const isEngineAction = (action: Action): action is EngineAction =>
  action.type === 'document.edit' ||
  action.type === 'document.publish' ||
  action.type === 'document.discard'

/**
 * Sends the actions through a document's engine when it can take all of them: edits, publishes
 * and discards of one document the engine handles. Returns the engine, the document's handle and
 * its local view from before the actions, or `undefined` to use the transaction queue.
 */
export function applyWithEngine(
  state: DocumentStoreState,
  actions: Action[],
): {engine: DocumentSync; handle: DocumentHandle; previous: ResolveDocument | null} | undefined {
  const [leading] = actions
  if (!leading || !isEngineAction(leading)) return undefined
  const publishedId = getPublishedId(DocumentId(leading.documentId))
  const sameDocument = actions.every(
    (action) =>
      isEngineAction(action) && getPublishedId(DocumentId(action.documentId)) === publishedId,
  )
  const engine = sameDocument ? engineForHandle(state, leading) : undefined
  if (!engine) return undefined
  const previous = engine.local() as ResolveDocument | null
  for (const action of actions as EngineAction[]) {
    if (action.type === 'document.publish') engine.publish()
    else if (action.type === 'document.discard') engine.discard()
    // Sent as given, as with `preserveOperations`: the engine does not re-derive patches.
    else if (action.patches?.length) engine.edit(action.patches as PatchOps[])
  }
  return {engine, handle: leading, previous}
}

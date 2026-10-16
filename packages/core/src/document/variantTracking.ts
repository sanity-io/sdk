import {type MutationEvent} from '@sanity/client'
import {DocumentId, getPublishedId, isVersionId} from '@sanity/id-utils'
import {type SanityDocument} from '@sanity/types'
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  groupBy,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  pairwise,
  startWith,
  Subject,
  Subscription,
  switchMap,
} from 'rxjs'

import {type DocumentHandle} from '../config/sanityConfig'
import {type BoundResourceKey} from '../store/createActionBinder'
import {type StoreContext} from '../store/defineStore'
import {omitProperty} from '../utils/object'
import {
  getDocumentKeyFromSystem,
  getGroupIdFromStoreKey,
  getVariantKeys,
  isUnknownDocumentId,
  toUnknownDocumentId,
  type UnknownDocumentId,
} from './documentKey'
import {type DocumentState, type DocumentStoreState} from './documentStore'
import {
  addSubscriptionIdToDocument,
  removeSubscriptionIdFromDocument,
} from './documentSubscriptions'
import {type AppliedTransaction} from './reducers'
import {retryTransientErrors} from './retryTransientErrors'

/**
 * The slice of store state the variant reducers operate on. Widened from
 * `SyncTransactionState` rather than folded into it so the many test fixtures
 * built against that type keep compiling.
 */
export type VariantTrackingState = Pick<
  DocumentStoreState,
  | 'queued'
  | 'applied'
  | 'documentStates'
  | 'outgoing'
  | 'grants'
  | 'identity'
  | 'variantIndex'
  | 'variantSubscriptions'
  | 'variantErrors'
>

type VariantHandleLike = Pick<DocumentHandle, 'documentId' | 'perspective' | 'variant' | 'liveEdit'>

/**
 * The variant keys a handle's document may resolve through, most specific
 * first. Follows Content Lake's precedence: the variant over the handle's
 * bundle, then the variant over the published bundle. Empty for non-variant
 * or liveEdit handles.
 */
export function getVariantCandidateKeys(handle: VariantHandleLike): string[] {
  if (!handle.variant || handle.liveEdit) return []
  const {overBundle, overPublished} = getVariantKeys({...handle, variant: handle.variant})
  return [overBundle, overPublished]
}

/**
 * Where a variant key currently points. `undefined` means the key has not
 * been resolved yet and callers should treat the document as loading.
 */
export function resolveVariantKey(
  state: Pick<VariantTrackingState, 'variantIndex' | 'documentStates'>,
  key: string,
): DocumentId | UnknownDocumentId | null | undefined {
  const id = state.variantIndex[key]
  // a pending entry can be evicted (or rebuilt away by a revert) while the
  // index still points at it. with nothing behind the key, the variant reads as
  // absent rather than loading forever
  if (id && isUnknownDocumentId(id) && !state.documentStates[id]) return null
  return id
}

/**
 * The store key behind each of a set of variant keys, as action processing
 * needs them. See `ActionHandlerContext.variantIds`.
 */
export interface ResolvedVariantIds {
  /** key → store key, for every variant key given */
  variantIds: Record<string, string>
  /** store keys of variants that exist remotely and must be loaded */
  concreteIds: string[]
  /** store keys of variants that don't exist remotely (pending or absent) */
  unknownIds: UnknownDocumentId[]
}

/**
 * Resolves variant keys through the variant index for action processing. A
 * variant that doesn't exist remotely (pending creation, or confirmed absent)
 * is addressed by its key, which is where a locally created variant lives.
 * Returns `undefined` while any key is still unresolved.
 */
export function resolveVariantIds(
  state: Pick<VariantTrackingState, 'variantIndex'>,
  keys: string[],
): ResolvedVariantIds | undefined {
  const resolved: ResolvedVariantIds = {variantIds: {}, concreteIds: [], unknownIds: []}
  for (const key of keys) {
    // pending and absent variants are both addressed by their key, so a pending
    // entry that no longer exists needs no special handling here
    const id = state.variantIndex[key]
    if (id === undefined) return undefined
    if (id === null || isUnknownDocumentId(id)) {
      const unknownId = toUnknownDocumentId(key)
      resolved.variantIds[key] = unknownId
      resolved.unknownIds.push(unknownId)
    } else {
      resolved.variantIds[key] = id
      resolved.concreteIds.push(id)
    }
  }
  return resolved
}

export function addVariantSubscription<State extends VariantTrackingState>(
  prev: State,
  key: string,
  subscriptionId: string,
): State {
  const next = {
    ...prev,
    variantSubscriptions: {
      ...prev.variantSubscriptions,
      [key]: [...(prev.variantSubscriptions[key] ?? []), subscriptionId],
    },
  }
  // when the key is already resolved, the subscriber also holds the concrete
  // document so it is fetched and listened to like any other
  const resolved = prev.variantIndex[key]
  return resolved ? addSubscriptionIdToDocument(next, resolved, subscriptionId) : next
}

/**
 * Releases a subscriber's interest in a variant key, and in the document the
 * key resolves to. Once the key has no subscribers left its index entry is
 * dropped too: nothing watches the group any more, so the entry would go stale,
 * and a later subscriber rediscovers the key from scratch. The exception is a
 * pending variant whose entry outlives its subscribers while it awaits its own
 * echo; dropping the index would orphan that entry.
 */
export function removeVariantSubscription<State extends VariantTrackingState>(
  prev: State,
  key: string,
  subscriptionId: string,
): State {
  const remaining = (prev.variantSubscriptions[key] ?? []).filter((id) => id !== subscriptionId)
  const next = {
    ...prev,
    variantSubscriptions: remaining.length
      ? {...prev.variantSubscriptions, [key]: remaining}
      : omitProperty(prev.variantSubscriptions, key),
  }
  const resolved = prev.variantIndex[key]
  const released = resolved
    ? removeSubscriptionIdFromDocument(next, resolved, subscriptionId)
    : next
  if (remaining.length) return released
  // a failure is only meaningful to the subscribers that saw it
  const cleared = clearVariantErrors(released, [key])
  if (!(key in cleared.variantIndex)) return cleared
  const isPendingEntryAlive =
    !!resolved && isUnknownDocumentId(resolved) && !!cleared.documentStates[resolved]
  if (isPendingEntryAlive) return cleared
  return {...cleared, variantIndex: omitProperty(cleared.variantIndex, key)}
}

/** Rethrows the first discovery failure recorded against the given variant keys. */
export function throwVariantErrors(
  state: Pick<VariantTrackingState, 'variantErrors'>,
  keys: string[],
): void {
  const {variantErrors} = state
  if (!variantErrors) return
  for (const key of keys) {
    if (key in variantErrors) throw variantErrors[key]
  }
}

function clearVariantErrors<State extends VariantTrackingState>(
  prev: State,
  keys: string[],
): State {
  const {variantErrors} = prev
  if (!variantErrors || !keys.some((key) => key in variantErrors)) return prev
  return {
    ...prev,
    variantErrors: keys.reduce((acc, key) => omitProperty(acc, key), variantErrors),
  }
}

/**
 * Gives a variant created locally a `documentStates` entry under its key,
 * held by the subscribers waiting on that key, and points the index at it.
 * The entry has no remote counterpart yet; `remote` is `null` so a revert
 * rebuilds it from nothing.
 */
export function createPendingVariantEntry<State extends VariantTrackingState>(
  prev: State,
  key: UnknownDocumentId,
  local: SanityDocument,
): State {
  const withEntry = (prev.variantSubscriptions[key] ?? []).reduce(
    (acc, subscriptionId) => addSubscriptionIdToDocument(acc, key, subscriptionId),
    prev,
  )
  const entry = withEntry.documentStates[key] ?? {id: key, subscriptions: []}
  return {
    ...withEntry,
    variantIndex: {...withEntry.variantIndex, [key]: key},
    documentStates: {
      ...withEntry.documentStates,
      [key]: {...entry, local, remote: null, remoteRev: undefined},
    },
  }
}

/**
 * Records that a variant key resolves to a concrete document, attaching every
 * subscriber waiting on the key to that document so the ordinary per-id
 * fetch-and-listen flow picks it up. A variant that was pending creation
 * locally is reconciled with the announced document first. Exported for tests.
 *
 * @internal
 */
export function resolveVariantToDocument<State extends VariantTrackingState>(
  prev: State,
  key: string,
  documentId: DocumentId,
): State {
  const current = prev.variantIndex[key]
  if (current === documentId) return prev
  // a pending variant's subscribers move with its entry; retargeting never
  // detaches from an unknown id
  const reconciled =
    current && isUnknownDocumentId(current)
      ? reconcileUnknownDocumentId(prev, current, documentId)
      : prev
  return retargetVariantKey(reconciled, key, documentId)
}

/**
 * Migrates everything held under a pending variant's key to the concrete id
 * the remote announced: its document state (subscriptions, optimistic `local`,
 * echo-recognition memory) and every reference in applied and outgoing
 * transactions, so rebases and reverts keep addressing the same document.
 * Afterwards the variant is addressed by id like any other document.
 */
function reconcileUnknownDocumentId<State extends VariantTrackingState>(
  prev: State,
  key: UnknownDocumentId,
  documentId: DocumentId,
): State {
  const pending = prev.documentStates[key]
  if (!pending) return prev

  const existing = prev.documentStates[documentId]
  const rekeyDocument = (document: SanityDocument | null | undefined) =>
    document ? {...document, _id: documentId} : document
  const rekeySet = <KeyedSet extends Record<string, unknown>>(set: KeyedSet): KeyedSet => {
    if (!(key in set)) return set
    const {[key]: value, ...rest} = set
    return {
      ...rest,
      [documentId]: rekeyDocument(value as SanityDocument | null | undefined),
    } as KeyedSet
  }
  const rekeyTransaction = <Transaction extends AppliedTransaction>(
    transaction: Transaction,
  ): Transaction => ({
    ...transaction,
    working: rekeySet(transaction.working),
    previous: rekeySet(transaction.previous),
    base: rekeySet(transaction.base),
    previousRevs: rekeySet(transaction.previousRevs),
    variantIds: Object.fromEntries(
      Object.entries(transaction.variantIds ?? {}).map(([variantKey, id]) => [
        variantKey,
        id === key ? documentId : id,
      ]),
    ),
  })

  const merged: DocumentState = {
    ...pending,
    ...existing,
    id: documentId,
    local: rekeyDocument(pending.local),
    subscriptions: [...new Set([...pending.subscriptions, ...(existing?.subscriptions ?? [])])],
    unverifiedRevisions: Object.fromEntries(
      Object.entries({...existing?.unverifiedRevisions, ...pending.unverifiedRevisions}).map(
        ([transactionId, revision]) => [
          transactionId,
          revision ? {...revision, documentId} : revision,
        ],
      ),
    ),
    recentOwnTransactionIds: [
      ...(existing?.recentOwnTransactionIds ?? []),
      ...(pending.recentOwnTransactionIds ?? []),
    ],
  }

  return {
    ...prev,
    documentStates: {...omitProperty(prev.documentStates, key), [documentId]: merged},
    applied: prev.applied.map(rekeyTransaction),
    outgoing: prev.outgoing ? rekeyTransaction(prev.outgoing) : prev.outgoing,
  }
}

/**
 * Records that the remote holds no document for a variant key. Selectors fall
 * through to the next candidate rather than waiting. Exported for tests.
 *
 * @internal
 */
export function markVariantAbsent<State extends VariantTrackingState>(
  prev: State,
  key: string,
): State {
  if (prev.variantIndex[key] === null) return prev
  return retargetVariantKey(prev, key, null)
}

/**
 * Points a variant key at a new target and moves the key's subscribers with
 * it. They are detached from the concrete document the key pointed at before
 * (which is evicted once nothing else holds it), so a variant that disappears
 * or is replaced doesn't keep its old document fetched and listened to.
 */
function retargetVariantKey<State extends VariantTrackingState>(
  prev: State,
  key: string,
  target: DocumentId | null,
): State {
  const previous = prev.variantIndex[key]
  const subscriptionIds = prev.variantSubscriptions[key] ?? []
  const detached =
    previous && !isUnknownDocumentId(previous)
      ? subscriptionIds.reduce(
          (acc, subscriptionId) => removeSubscriptionIdFromDocument(acc, previous, subscriptionId),
          prev,
        )
      : prev
  const withIndex = {...detached, variantIndex: {...detached.variantIndex, [key]: target}}
  if (!target) return withIndex
  return subscriptionIds.reduce(
    (acc, subscriptionId) => addSubscriptionIdToDocument(acc, target, subscriptionId),
    withIndex,
  )
}

/**
 * Watches the set of variant keys with subscribers and discovers the documents
 * behind them. Variant ids can't be derived from a handle, so this fetches a
 * key's document group in full (whenever a new key appears in it, and
 * whenever the shared listener reconnects) and matches the returned documents
 * to keys by their `_system` identity. Thereafter it watches the shared
 * listener for variant documents appearing or disappearing in a watched group.
 *
 * Fetches are triggered per key, not per group: a group fetch only settles the
 * keys registered when it ran, so a key added later to an already-watched
 * group (say, the same variant under a newly selected release) needs its own.
 */
export const subscribeToVariantSubscriptionsAndDiscover = ({
  state,
}: StoreContext<DocumentStoreState, BoundResourceKey>): Subscription => {
  const {sharedListener, fetchDocumentGroup, fetchDocument} = state.get()

  const watchedKeys$ = state.observable.pipe(
    filter((storeState) => !!storeState.grants),
    map((storeState) => new Set(Object.keys(storeState.variantSubscriptions))),
    distinctUntilChanged(
      (previous, current) =>
        previous.size === current.size && [...previous].every((key) => current.has(key)),
    ),
  )

  // the shared listener disconnects once nothing observes it, so the discovery
  // streams only observe it while at least one variant key is watched
  const listenerWhileWatching$ = state.observable.pipe(
    map((storeState) => Object.keys(storeState.variantSubscriptions).length > 0),
    distinctUntilChanged(),
    switchMap((watching) => (watching ? sharedListener.events : EMPTY)),
  )

  // a fresh connection (or one that could not resume) may have missed variants
  // appearing or disappearing, so every watched group is refetched
  const resync$ = listenerWhileWatching$.pipe(
    filter((event) => event.type === 'welcome' || event.type === 'reset'),
  )

  // groups whose appearing document couldn't be read, to be fetched again
  const appearanceFailures$ = new Subject<string>()

  // a failure is reported for its group rather than ending the stream, so
  // discovery carries on for every other group, and for this one on its next
  // trigger
  const fetchGroup = (groupId: string): Observable<GroupFetchResult> =>
    fetchDocumentGroup(groupId).pipe(
      retryTransientErrors(),
      map((response): GroupFetchResult => ({
        status: 'fetched',
        groupId,
        documents: response.documents,
      })),
      catchError((error: unknown) => of<GroupFetchResult>({status: 'failed', groupId, error})),
    )

  const groupFetches = watchedKeys$.pipe(
    startWith(new Set<string>()),
    pairwise(),
    // the groups of the keys that just appeared, each once
    switchMap(([previous, current]) =>
      from(new Set([...current].filter((key) => !previous.has(key)).map(getGroupIdFromStoreKey))),
    ),
    groupBy((groupId) => groupId),
    mergeMap((group$) =>
      group$.pipe(
        switchMap((groupId) =>
          merge(
            of(undefined),
            resync$,
            appearanceFailures$.pipe(filter((id) => id === groupId)),
          ).pipe(switchMap(() => fetchGroup(groupId))),
        ),
      ),
    ),
  )

  // variant documents appearing in a watched group that the index doesn't know
  // yet. their `_system` is on the create mutation when the listener includes
  // mutations; otherwise the document is fetched to read it
  const appearances = listenerWhileWatching$.pipe(
    filter((event): event is MutationEvent => event.type === 'mutation'),
    filter((event) => event.transition === 'appear' && isVersionId(DocumentId(event.documentId))),
    mergeMap((event) => {
      const groupId = getPublishedId(DocumentId(event.documentId))
      const {variantSubscriptions} = state.get()
      const watched = Object.keys(variantSubscriptions).some(
        (key) => getGroupIdFromStoreKey(key) === groupId,
      )
      if (!watched) return EMPTY
      const created = findCreatedDocument(event)
      const document$: Observable<SanityDocument | null> = created
        ? of(created)
        : (fetchDocument(event.documentId) as Observable<SanityDocument | null>).pipe(
            retryTransientErrors(),
            // the document may be unreadable, or the read may have failed. the
            // group fetch settles the group either way, and records a failure
            // against its keys if it fails too
            catchError(() => {
              appearanceFailures$.next(groupId)
              return EMPTY
            }),
          )
      return document$.pipe(
        filter((document): document is SanityDocument => document !== null),
        map((document) => ({groupId, documents: [document]})),
      )
    }),
  )

  const disappearances = listenerWhileWatching$.pipe(
    filter((event): event is MutationEvent => event.type === 'mutation'),
    filter((event) => event.transition === 'disappear'),
  )

  const subscription = new Subscription()
  // fetch failures are recorded per variant key (see `failVariantGroup`), so
  // an error reaching a subscriber here is a bug in discovery itself. it is
  // surfaced store-wide, as the store's other streams do, rather than leaving
  // every variant selector loading forever
  const setError = (error: unknown) => state.set('setError', {error})

  subscription.add(
    groupFetches.subscribe({
      next: (result) => {
        if (result.status === 'failed') {
          state.set('failVariantGroup', (prev) =>
            failVariantGroup(prev, result.groupId, result.error),
          )
        } else {
          state.set('discoverVariantGroup', (prev) =>
            discoverVariantGroup(prev, result.groupId, result.documents),
          )
        }
      },
      error: setError,
    }),
  )

  // an appearance says nothing about the group's other variants
  subscription.add(
    appearances.subscribe({
      next: ({documents}) => {
        state.set('discoverVariantAppearance', (prev) => resolveDiscovered(prev, documents).next)
      },
      error: setError,
    }),
  )

  subscription.add(
    disappearances.subscribe((event) => {
      state.set('markVariantDisappeared', (prev) => {
        const entry = Object.entries(prev.variantIndex).find(([, id]) => id === event.documentId)
        return entry ? markVariantAbsent(prev, entry[0]) : prev
      })
    }),
  )

  return subscription
}

type GroupFetchResult =
  | {status: 'fetched'; groupId: string; documents: SanityDocument[]}
  | {status: 'failed'; groupId: string; error: unknown}

/** The watched keys a document group's discovery settles. */
function getGroupKeys(state: VariantTrackingState, groupId: string): string[] {
  return Object.keys(state.variantSubscriptions).filter(
    (key) => getGroupIdFromStoreKey(key) === groupId,
  )
}

/** Points each watched key that one of the documents carries at that document. */
function resolveDiscovered<State extends VariantTrackingState>(
  prev: State,
  documents: SanityDocument[],
): {next: State; found: Set<string>} {
  let next = prev
  const found = new Set<string>()
  for (const document of documents) {
    const key = getDocumentKeyFromSystem(document)
    if (!key || !(key in prev.variantSubscriptions)) continue
    found.add(key)
    next = resolveVariantToDocument(next, key, DocumentId(document._id))
  }
  return {next, found}
}

/**
 * Applies a full group fetch. It is authoritative: any watched key in the group
 * that it did not return is marked absent, unless it is a locally pending
 * variant that the remote has not been told about yet. Earlier failures for
 * the group's keys are cleared.
 */
function discoverVariantGroup<State extends VariantTrackingState>(
  prev: State,
  groupId: string,
  documents: SanityDocument[],
): State {
  const groupKeys = getGroupKeys(prev, groupId)
  const {next, found} = resolveDiscovered(clearVariantErrors(prev, groupKeys), documents)
  return groupKeys.reduce((acc, key) => {
    if (found.has(key)) return acc
    if (isUnknownDocumentId(resolveVariantKey(prev, key) ?? '')) return acc
    return markVariantAbsent(acc, key)
  }, next)
}

/**
 * Records a group fetch that failed after retries against the group's watched
 * keys that are still unresolved, so selectors reading through them rethrow it.
 * Keys that already resolved keep showing their document, which stays live
 * through its own listener.
 */
function failVariantGroup<State extends VariantTrackingState>(
  prev: State,
  groupId: string,
  error: unknown,
): State {
  const failedKeys = getGroupKeys(prev, groupId).filter((key) => !(key in prev.variantIndex))
  if (!failedKeys.length) return prev
  return {
    ...prev,
    variantErrors: {
      ...prev.variantErrors,
      ...Object.fromEntries(failedKeys.map((key) => [key, error])),
    },
  }
}

function findCreatedDocument(event: MutationEvent): SanityDocument | undefined {
  for (const mutation of event.mutations) {
    const created =
      'create' in mutation
        ? mutation.create
        : 'createOrReplace' in mutation
          ? mutation.createOrReplace
          : 'createIfNotExists' in mutation
            ? mutation.createIfNotExists
            : undefined
    if (created && created['_id'] === event.documentId) return created as SanityDocument
  }
  return undefined
}

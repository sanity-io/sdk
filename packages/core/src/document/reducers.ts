import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'
import {type Mutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'

import {type DocumentHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type StoreContext} from '../store/defineStore'
import {insecureRandomId} from '../utils/ids'
import {isDeepEqual, omitProperty} from '../utils/object'
import {setCleanupTimeout} from '../utils/setCleanupTimeout'
import {type Action} from './actions'
import {DOCUMENT_STATE_CLEAR_DELAY} from './documentConstants'
import {type DocumentState, type DocumentStoreState} from './documentStore'
import {type RemoteDocument} from './listen'
import {ActionError, processActions} from './processActions/processActions'
import {getReleaseDocumentId, isReleaseAction} from './processActions/releaseUtil'
import {type DocumentSet} from './processMutations'

const EMPTY_REVISIONS: NonNullable<Required<DocumentState['unverifiedRevisions']>> = {}

/**
 * How many of this client's own transaction IDs to remember per document for
 * `remote-patches` origin labeling. Sized to comfortably outlast the window
 * between submitting a transaction and observing its listener echo.
 */
const MAX_RECENT_OWN_TRANSACTION_IDS = 50

export type SyncTransactionState = Pick<
  DocumentStoreState,
  'queued' | 'applied' | 'documentStates' | 'outgoing' | 'grants' | 'identity'
>

type DocumentHandleLike = Pick<DocumentHandle, 'perspective'> & {
  documentId?: string
  liveEdit?: boolean
}

type ActionMap = {
  create: 'sanity.action.document.version.create'
  discard: 'sanity.action.document.version.discard'
  unpublish: 'sanity.action.document.unpublish'
  delete: 'sanity.action.document.delete'
  edit: 'sanity.action.document.edit'
  publish: 'sanity.action.document.publish'
  releaseCreate: 'sanity.action.release.create'
  releaseEdit: 'sanity.action.release.edit'
  releasePublish: 'sanity.action.release.publish'
  releaseSchedule: 'sanity.action.release.schedule'
  releaseUnschedule: 'sanity.action.release.unschedule'
  releaseArchive: 'sanity.action.release.archive'
  releaseUnarchive: 'sanity.action.release.unarchive'
  releaseDelete: 'sanity.action.release.delete'
}

type OptimisticLock = {
  ifDraftRevisionId?: string
  ifPublishedRevisionId?: string
}

interface ReleaseMetadataPayload {
  title?: string
  description?: string
  intendedPublishAt?: string
  releaseType?: 'asap' | 'scheduled' | 'undecided'
  cardinality?: 'one' | 'many'
}

export type HttpAction =
  | {actionType: ActionMap['create']; publishedId: string; attributes: SanityDocumentLike}
  | {actionType: ActionMap['discard']; versionId: string; purge?: boolean}
  | {actionType: ActionMap['unpublish']; draftId: string; publishedId: string}
  | {actionType: ActionMap['delete']; publishedId: string; includeDrafts?: string[]}
  | {actionType: ActionMap['edit']; draftId: string; publishedId: string; patch: PatchOperations}
  | ({actionType: ActionMap['publish']; draftId: string; publishedId: string} & OptimisticLock)
  | {
      actionType: ActionMap['releaseCreate']
      releaseId: string
      metadata?: ReleaseMetadataPayload
    }
  | {actionType: ActionMap['releaseEdit']; releaseId: string; patch: PatchOperations}
  | {actionType: ActionMap['releasePublish']; releaseId: string}
  | {actionType: ActionMap['releaseSchedule']; releaseId: string; publishAt: string}
  | {actionType: ActionMap['releaseUnschedule']; releaseId: string}
  | {actionType: ActionMap['releaseArchive']; releaseId: string}
  | {actionType: ActionMap['releaseUnarchive']; releaseId: string}
  | {actionType: ActionMap['releaseDelete']; releaseId: string}

/**
 * Represents a transaction that is queued to be applied but has not yet been
 * applied. A transaction will remain in a queued state until all required
 * documents for the transactions are available locally.
 */
export interface QueuedTransaction {
  /**
   * the ID of this transaction. this is generated client-side.
   */
  transactionId: string
  /**
   * the high-level actions associated with this transaction. note that these
   * actions don't mention draft IDs and is meant to abstract away the draft
   * model from users.
   */
  actions: Action[]
  /**
   * An optional flag set to disable this transaction from being batched with
   * other transactions.
   */
  disableBatching?: boolean
}

/**
 * Represents a transaction that has been applied locally but has not been
 * committed/transitioned-to-outgoing. These transactions are visible to the
 * user but may be rebased upon a new working document set. Applied transactions
 * also contain the resulting `outgoingActions` that will be submitted to
 * Content Lake. These `outgoingActions` depend on the state of the working
 * documents so they are recomputed on rebase and are only relevant to applied
 * actions (we cannot compute `outgoingActions` for queued transactions because
 * we haven't resolved the set of documents the actions are dependent on yet).
 *
 * In order to support better conflict resolution, the original `previous` set
 * is saved as the `base` set.
 */
export interface AppliedTransaction extends QueuedTransaction {
  /**
   * the resulting set of documents after the actions have been applied
   */
  working: DocumentSet

  /**
   * the previous set of documents before the action was applied
   */
  previous: DocumentSet

  /**
   * the original `previous` document set captured when this action was
   * originally applied. this is used as a reference point to do a 3-way merge
   * if this applied transaction ever needs to be reapplied on a different
   * set of documents.
   */
  base: DocumentSet

  /**
   * the `_rev`s from `previous` document set
   */
  previousRevs: {[TDocumentId in string]?: string}

  /**
   * a timestamp for when this transaction was applied locally
   */
  timestamp: string

  /**
   * the resulting HTTP actions derived from the state of the `working` document
   * set. these are sent to Content Lake as-is when this transaction is batched
   * and transitioned into an outgoing transaction.
   */
  outgoingActions: HttpAction[]

  /**
   * similar to `outgoingActions` but comprised of mutations instead of actions.
   * Useful for debugging, and is also used by liveEdit documents to send mutations,
   * since they can't use the Actions API which is pretty dependent on the draft model.
   */
  outgoingMutations: Mutation[]
}

/**
 * Represents a set of applied transactions batched into a single outgoing
 * transaction. An outgoing transaction is the result of batching many applied
 * actions. An outgoing transaction may be reverted locally if the server
 * does not accept it.
 */
export interface OutgoingTransaction extends AppliedTransaction {
  disableBatching: boolean
  batchedTransactionIds: string[]
}

export interface UnverifiedDocumentRevision {
  transactionId: string
  documentId: string
  previousRev: string | undefined
  timestamp: string
}

export function queueTransaction(
  prev: SyncTransactionState,
  transaction: QueuedTransaction,
): SyncTransactionState {
  const {transactionId, actions} = transaction
  const prevWithSubscriptionIds = getDocumentIdsFromHandleLikes(actions).reduce(
    (acc, id) => addSubscriptionIdToDocument(acc, id, transactionId),
    prev,
  )

  return {
    ...prevWithSubscriptionIds,
    queued: [...prev.queued, transaction],
  }
}

export function removeQueuedTransaction(
  prev: SyncTransactionState,
  transactionId: string,
): SyncTransactionState {
  const transaction = prev.queued.find((t) => t.transactionId === transactionId)
  if (!transaction) return prev

  const prevWithSubscriptionIds = getDocumentIdsFromHandleLikes(transaction.actions).reduce(
    (acc, id) => removeSubscriptionIdFromDocument(acc, id, transactionId),
    prev,
  )

  return {
    ...prevWithSubscriptionIds,
    queued: prev.queued.filter((t) => transactionId !== t.transactionId),
  }
}

export function applyFirstQueuedTransaction(prev: SyncTransactionState): SyncTransactionState {
  const queued = prev.queued.at(0)
  if (!queued) return prev
  if (!prev.grants) return prev

  const ids = getDocumentIdsFromHandleLikes(queued.actions)
  // the local value is only ever `undefined` if it has not been loaded yet
  // we can't get the next applied state unless all relevant documents are ready
  if (ids.some((id) => prev.documentStates[id]?.local === undefined)) return prev

  const working = ids.reduce<DocumentSet>((acc, id) => {
    acc[id] = prev.documentStates[id]?.local
    return acc
  }, {})

  const timestamp = new Date().toISOString()

  const result = processActions({
    ...queued,
    working,
    base: working,
    timestamp,
    grants: prev.grants,
    identity: prev.identity,
  })
  const applied: AppliedTransaction = {
    ...queued,
    ...result,
    base: result.previous,
    timestamp,
  }

  return {
    ...prev,
    applied: [...prev.applied, applied],
    queued: prev.queued.filter((t) => t.transactionId !== queued.transactionId),
    documentStates: Object.entries(result.working).reduce(
      (acc, [id, next]) => {
        const prevDoc = acc[id]
        if (!prevDoc) return acc
        acc[id] = {...prevDoc, local: next}
        return acc
      },
      {...prev.documentStates},
    ),
  }
}

export function batchAppliedTransactions([curr, ...rest]: AppliedTransaction[]):
  | OutgoingTransaction
  | undefined {
  // No transactions? Nothing to batch.
  if (!curr) return undefined

  // Skip transactions with no actions.
  if (!curr.actions.length) return batchAppliedTransactions(rest)

  // If there are multiple actions, we cannot batch further.
  if (curr.actions.length > 1) {
    return {
      ...curr,
      disableBatching: true,
      batchedTransactionIds: [curr.transactionId],
    }
  }

  const [action] = curr.actions

  // If the single action isn't a document.edit or batching is disabled,
  // mark this transaction as non-batchable.
  if (action.type !== 'document.edit' || curr.disableBatching) {
    return {
      ...curr,
      disableBatching: true,
      batchedTransactionIds: [curr.transactionId],
    }
  }

  // Create an outgoing transaction for the single edit action.
  // At this point, batching is allowed.
  const editAction: OutgoingTransaction = {
    ...curr,
    actions: [action],
    disableBatching: false,
    batchedTransactionIds: [curr.transactionId],
  }
  if (!rest.length) return editAction

  const next = batchAppliedTransactions(rest)
  if (!next) return undefined
  if (next.disableBatching) return editAction

  // Don't batch a liveEdit edit with a non-liveEdit edit — they route to different APIs
  const nextFirst = next.actions[0]
  const nextLiveEdit = nextFirst && 'liveEdit' in nextFirst ? nextFirst.liveEdit : false
  if (!!action.liveEdit !== !!nextLiveEdit) return editAction

  return {
    disableBatching: false,
    // Use the transactionId from the later (next) transaction.
    transactionId: next.transactionId,
    // Accumulate actions: current action first, then later ones.
    actions: [action, ...next.actions],
    // Merge outgoingActions in order.
    outgoingActions: [...curr.outgoingActions, ...next.outgoingActions],
    // Batched transaction IDs: preserve order by placing curr first.
    batchedTransactionIds: [curr.transactionId, ...next.batchedTransactionIds],
    // Merge outgoingMutations in order.
    outgoingMutations: [...curr.outgoingMutations, ...next.outgoingMutations],
    // Working state reflects the latest optimistic changes: later transactions override earlier.
    working: {...curr.working, ...next.working},
    // Base state (base, previous, previousRevs) must reflect the original state.
    // Use curr values (the earliest transaction) to override later ones.
    previousRevs: {...next.previousRevs, ...curr.previousRevs},
    previous: {...next.previous, ...curr.previous},
    base: {...next.base, ...curr.base},
    // Use the earliest timestamp from curr.
    timestamp: curr.timestamp ?? next.timestamp,
  }
}

export function transitionAppliedTransactionsToOutgoing(
  prev: SyncTransactionState,
): SyncTransactionState {
  if (prev.outgoing) return prev

  const transaction = batchAppliedTransactions(prev.applied)
  if (!transaction) return prev

  const {
    transactionId,
    previousRevs,
    working,
    batchedTransactionIds: consumedTransactions,
  } = transaction
  const timestamp = new Date().toISOString()

  return {
    ...prev,
    outgoing: transaction,
    applied: prev.applied.filter((i) => !consumedTransactions.includes(i.transactionId)),
    documentStates: Object.entries(previousRevs).reduce(
      (acc, [documentId, previousRev]) => {
        if (working[documentId]?._rev === previousRev) return acc

        const documentState = prev.documentStates[documentId]
        if (!documentState) return acc

        acc[documentId] = {
          ...documentState,
          unverifiedRevisions: {
            ...documentState.unverifiedRevisions,
            // add unverified revision
            [transactionId]: {documentId, previousRev, transactionId, timestamp},
          },
          // also track the transaction ID durably (unverified revisions can be
          // pruned by sync events before the listener echo arrives) so
          // `remote-patches` events label our own transactions correctly
          recentOwnTransactionIds: [
            ...(documentState.recentOwnTransactionIds ?? []).slice(
              -(MAX_RECENT_OWN_TRANSACTION_IDS - 1),
            ),
            transactionId,
          ],
        }

        return acc
      },
      {...prev.documentStates},
    ),
  }
}

export function cleanupOutgoingTransaction(prev: SyncTransactionState): SyncTransactionState {
  const {outgoing} = prev
  if (!outgoing) return prev

  let next = prev
  const ids = getDocumentIdsFromHandleLikes(outgoing.actions)
  for (const transactionId of outgoing.batchedTransactionIds) {
    for (const documentId of ids) {
      next = removeSubscriptionIdFromDocument(next, documentId, transactionId)
    }
  }

  return {...next, outgoing: undefined}
}

export function revertOutgoingTransaction(prev: SyncTransactionState): SyncTransactionState {
  if (!prev.grants) return prev
  let working = Object.fromEntries(
    Object.entries(prev.documentStates).map(([documentId, documentState]) => [
      documentId,
      documentState?.remote,
    ]),
  )
  const nextApplied: AppliedTransaction[] = []

  for (const t of prev.applied) {
    try {
      const next = processActions({...t, working, grants: prev.grants, identity: prev.identity})
      working = next.working
      nextApplied.push({...t, ...next})
    } catch (error) {
      // if we're already reverting a transaction, skip any applied actions if
      // they throw while we rebuild the state
      if (error instanceof ActionError) continue
      throw error
    }
  }

  return {
    ...prev,
    applied: nextApplied,
    outgoing: undefined,
    documentStates: Object.fromEntries(
      Object.entries(prev.documentStates)
        .filter((e): e is [string, DocumentState] => !!e[1])
        .map(([documentId, {unverifiedRevisions = {}, local, ...documentState}]) => {
          const next: DocumentState = {
            ...documentState,
            local: documentId in working ? working[documentId] : local,
            unverifiedRevisions:
              prev.outgoing && prev.outgoing.transactionId in unverifiedRevisions
                ? omitProperty(unverifiedRevisions, prev.outgoing.transactionId)
                : unverifiedRevisions,
          }
          return [documentId, next] as const
        }),
    ),
  }
}

/**
 * Extracts the patch operations addressed to the given document from a set of
 * raw listener mutations, stripping the mutation-level `id` addressing so the
 * patches are rooted at the document. A transaction can carry mutations for
 * other documents, so anything not explicitly id-addressed to this document
 * (including query-addressed patches) is dropped.
 */
function extractPatchOperations(
  mutations: Mutation[] | undefined,
  documentId: string,
): PatchOperations[] {
  if (!mutations) return []
  return mutations.flatMap((mutation) => {
    if (!('patch' in mutation) || !mutation.patch) return []
    const {id, ...operations} = mutation.patch as PatchOperations & {id?: string}
    if (id !== documentId) return []
    return [operations]
  })
}

// Opt-in sync diagnostics for concurrency investigations: set
// `globalThis.__SDK_SYNC_DEBUG = true` before load (harness: SYNC_DEBUG=1).
// Free when off.
function syncDebugEnabled(): boolean {
  return (globalThis as {__SDK_SYNC_DEBUG?: boolean}).__SDK_SYNC_DEBUG === true
}

type SyncDebugDigest = {
  sample: string
  chars: number
  /** Count of the duo-paste harness phrase; useful for H1 outgoing-wipe traces. */
  imFeeling: number
}

/** Compact digest of Portable-Text-shaped fields for `[sdk-sync]` trace lines. */
function syncDebugTextDigest(doc: unknown): SyncDebugDigest {
  if (!doc || typeof doc !== 'object') {
    return {sample: '<none>', chars: 0, imFeeling: 0}
  }
  for (const field of ['blocks', 'content']) {
    const value = (doc as Record<string, unknown>)[field]
    if (!Array.isArray(value)) continue
    const sample = value
      .map((blockNode) => {
        const children = (blockNode as {children?: {text?: string}[]}).children
        if (!Array.isArray(children)) return ''
        return children.map((child) => child.text ?? '').join('|')
      })
      .join(' ¶ ')
    return {
      sample: sample.length > 240 ? `${sample.slice(0, 240)}…` : sample,
      chars: sample.length,
      imFeeling: sample.split("I'm feeling").length - 1,
    }
  }
  return {sample: '<no pte field>', chars: 0, imFeeling: 0}
}

function syncDebug(label: string, payload: Record<string, unknown>): void {
  if (!syncDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.debug(`[sdk-sync] ${label} ${JSON.stringify(payload)}`)
}

export function applyRemoteDocument(
  prev: SyncTransactionState,
  {document, documentId, previousRev, revision, timestamp, type, mutations}: RemoteDocument,
  events: DocumentStoreState['events'],
): SyncTransactionState {
  if (!prev.grants) return prev
  const prevDocState = prev.documentStates[documentId]

  // document state is deleted when there are no more subscribers so we can
  // simply skip if there is no state
  if (!prevDocState) return prev

  const prevLocalDigest = syncDebugTextDigest(prevDocState.local)
  const remoteDigest = syncDebugTextDigest(document)
  syncDebug('remote-in', {
    documentId,
    type,
    revision,
    previousRev,
    own: Boolean(revision && prevDocState.unverifiedRevisions?.[revision]),
    appliedTxs: prev.applied.map((transaction) => transaction.transactionId),
    appliedCount: prev.applied.length,
    outgoingTx: prev.outgoing?.transactionId ?? null,
    outgoingPresent: Boolean(prev.outgoing),
    remote: remoteDigest,
    local: prevLocalDigest,
  })

  // we send out transactions with IDs generated client-side to identify them
  // when they are observed through the listener. here we can check if this
  // incoming remote document is the result of one of our transactions
  const prevUnverifiedRevisions = prevDocState.unverifiedRevisions
  const revisionToVerify = revision ? prevUnverifiedRevisions?.[revision] : undefined
  let unverifiedRevisions = prevUnverifiedRevisions ?? EMPTY_REVISIONS
  if (revision && revisionToVerify) {
    unverifiedRevisions = omitProperty(prevUnverifiedRevisions, revision)
  }

  // surface the operational patches from this transaction before they are
  // collapsed into the whole-document snapshot below. consumers that keep
  // their own state (e.g. collaborative text editors) rely on these to apply
  // remote changes without re-diffing document snapshots
  if (type === 'mutation' && revision) {
    const patches = extractPatchOperations(mutations, documentId)
    if (patches.length) {
      // `unverifiedRevisions` alone isn't a reliable origin marker: a sync
      // event can prune an in-flight transaction's entry before its listener
      // echo arrives. `recentOwnTransactionIds` survives that race
      const isOwnTransaction =
        Boolean(revisionToVerify) ||
        (prevDocState.recentOwnTransactionIds?.includes(revision) ?? false)
      events.next({
        type: 'remote-patches',
        documentId,
        transactionId: revision,
        previousRev,
        timestamp,
        patches,
        origin: isOwnTransaction ? 'local' : 'remote',
      })
    }
  }

  // if this remote document is from a `'sync'` event (meaning that the whole
  // thing was just fetched and not re-created from mutations)
  if (type === 'sync') {
    // then remove unverified revisions that are older than our sync time. we
    // don't need to verify them for a rebase any more because we synced and
    // grabbed the latest document
    unverifiedRevisions = Object.fromEntries(
      Object.entries(unverifiedRevisions).filter(([, unverifiedRevision]) => {
        if (!unverifiedRevision) return false
        return new Date(timestamp).getTime() <= new Date(unverifiedRevision.timestamp).getTime()
      }),
    )
  }

  // if there is a revision to verify and the previous revision from remote
  // matches the previous revision we expected, we can "fast-forward" and skip
  // rebasing local changes on top of this new base
  if (revisionToVerify && revisionToVerify.previousRev === previousRev) {
    // even on a clean fast-forward, the server's result can differ from our
    // optimistic prediction: a publish derives the published content from the
    // server's copy of the draft, which may carry concurrent edits our
    // prediction never saw. once nothing else is pending locally for this
    // document (no applied transaction and no in-flight transaction, other
    // than the one this event just confirmed, modifies it), converge `local`
    // to the server's document. while local work that modifies this document
    // is pending, keep the optimistic `local` so those changes stay visible;
    // that work's own echo (or rebase) recomputes `local` later.
    //
    // "modifies" matters: pending work on other documents must not block
    // convergence here (nothing would ever revisit this document's `local`),
    // and a pending draft edit carries the published document in its working
    // set without changing it, so a presence check would block published-doc
    // convergence whenever a draft edit is pending. this is the same
    // modified-test `transitionAppliedTransactionsToOutgoing` uses
    const modifiesDocument = (transaction: AppliedTransaction) =>
      transaction.working[documentId]?._rev !== transaction.previousRevs[documentId]
    const nothingElsePending =
      !prev.applied.some(modifiesDocument) &&
      (!prev.outgoing ||
        prev.outgoing.transactionId === revision ||
        !modifiesDocument(prev.outgoing))
    const local =
      nothingElsePending && !isDeepEqual(prevDocState.local, document)
        ? document
        : prevDocState.local

    const localDigest = syncDebugTextDigest(local)
    syncDebug('fast-forward', {
      documentId,
      revision,
      converged: nothingElsePending,
      local: localDigest,
      localLostImFeeling: localDigest.imFeeling < prevLocalDigest.imFeeling,
    })

    return {
      ...prev,
      documentStates: {
        ...prev.documentStates,
        [documentId]: {
          ...prevDocState,
          remote: document,
          remoteRev: revision,
          local,
          unverifiedRevisions,
        },
      },
    }
  }

  // if we got this far, this means that we could not fast-forward this revision
  // for this document. now we can rebase our local changes (if any) on top of
  // this new base from remote. in order to do that we grab the set of documents
  // captured before the earliest local transaction
  const previous = prev.applied.at(0)?.previous
  // our initial working set now is the state of the documents before any of our
  // local transactions plus the newly updated document from remote
  let working = {...previous, [documentId]: document}
  const nextApplied: AppliedTransaction[] = []

  // When pastes (or other edits) sit only in `outgoing` with an empty `applied`
  // queue, re-apply that submitted transaction onto the new remote for local
  // EDGE only. Mutator keeps submitted work on EDGE; without this, local snaps
  // to remote and the plugin can repair away in-flight paste text. Do not mutate
  // `outgoing` itself; `processActions`/`processMutations` mutate document sets
  // in place, so clone `base`/`previous` before re-applying. Skip when `applied`
  // is non-empty: those txns already sit on the outgoing optimistic chain, and
  // replaying both double-applies.
  if (
    prev.outgoing &&
    prev.grants &&
    prev.outgoing.actions.length > 0 &&
    prev.applied.length === 0 &&
    // Own echo already includes this transaction's result; re-applying would
    // duplicate inserts/DMP hunks (e.g. `oneA oneA`).
    prev.outgoing.transactionId !== revision
  ) {
    try {
      const next = processActions({
        transactionId: prev.outgoing.transactionId,
        actions: prev.outgoing.actions,
        timestamp: prev.outgoing.timestamp,
        base: structuredClone(prev.outgoing.base),
        working: {
          ...structuredClone(prev.outgoing.previous),
          [documentId]: document,
        },
        grants: prev.grants,
        identity: prev.identity,
      })
      working = next.working
    } catch (error) {
      if (error instanceof ActionError) {
        syncDebug('outgoing-rebase-error', {
          documentId: error.documentId,
          transactionId: error.transactionId,
          message: error.message,
        })
        events.next({
          type: 'rebase-error',
          transactionId: error.transactionId,
          documentId: error.documentId,
          message: error.message,
          error,
        })
      } else {
        throw error
      }
    }
  }

  // now we can iterate through our applied (but not yet committed) transactions
  // starting with the updated working set and re-apply each transaction in
  // order creating a new set of applied transactions as we go.
  for (const curr of prev.applied) {
    try {
      const next = processActions({...curr, working, grants: prev.grants, identity: prev.identity})
      working = next.working
      // next includes an updated `previous` set and `working` set and updates
      // the `outgoingAction` and `outgoingMutations`. the `base` set from the
      // original applied transaction gets put back into the updated transaction
      // as-is to preserve the intended base for a 3-way merge
      nextApplied.push({...curr, ...next})
    } catch (error) {
      // if processing the action ever throws a related error, we can skip this
      // local transaction and report the error to the user
      if (error instanceof ActionError) {
        syncDebug('rebase-error', {
          documentId: error.documentId,
          transactionId: error.transactionId,
          message: error.message,
          outgoingPresent: Boolean(prev.outgoing),
          appliedCount: prev.applied.length,
        })
        events.next({
          type: 'rebase-error',
          transactionId: error.transactionId,
          documentId: error.documentId,
          message: error.message,
          error,
        })
        continue
      }
      throw error
    }
  }

  // when the recompute lands on a value deep-equal to the current local
  // (the common case for echoes of our own transactions), keep the previous
  // reference so subscribers don't re-render for an identical value
  const nextLocal = working[documentId]
  const local = isDeepEqual(prevDocState.local, nextLocal) ? prevDocState.local : nextLocal

  const localDigest = syncDebugTextDigest(local)
  syncDebug('rebase', {
    documentId,
    revision,
    outgoingPresent: Boolean(prev.outgoing),
    outgoingTx: prev.outgoing?.transactionId ?? null,
    appliedCountBefore: prev.applied.length,
    replayedTxs: nextApplied.map((transaction) => transaction.transactionId),
    // After Phase 1, outgoing is re-applied for local EDGE before this digest.
    local: localDigest,
    remote: remoteDigest,
    prevLocal: prevLocalDigest,
    localLostImFeeling: localDigest.imFeeling < prevLocalDigest.imFeeling,
    localLostChars: localDigest.chars < prevLocalDigest.chars,
  })

  return {
    ...prev,
    applied: nextApplied,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {
        ...prevDocState,
        remote: document,
        remoteRev: revision,
        local,
        unverifiedRevisions,
      },
    },
  }
}

export function addSubscriptionIdToDocument(
  prev: SyncTransactionState,
  documentId: string,
  subscriptionId: string,
): SyncTransactionState {
  const prevDocState = prev.documentStates?.[documentId]
  const prevSubscriptions = prevDocState?.subscriptions ?? []

  return {
    ...prev,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {
        ...prevDocState,
        id: documentId,
        subscriptions: [...prevSubscriptions, subscriptionId],
      },
    },
  }
}

export function removeSubscriptionIdFromDocument(
  prev: SyncTransactionState,
  documentId: string,
  subscriptionId: string,
): SyncTransactionState {
  const prevDocState = prev.documentStates?.[documentId]
  const prevSubscriptions = prevDocState?.subscriptions ?? []
  const subscriptions = prevSubscriptions.filter((id) => id !== subscriptionId)

  if (!prevDocState) return prev
  if (!subscriptions.length) {
    return {...prev, documentStates: omitProperty(prev.documentStates, documentId)}
  }
  return {
    ...prev,
    documentStates: {
      ...prev.documentStates,
      [documentId]: {...prevDocState, subscriptions: subscriptions},
    },
  }
}

export function manageSubscriberIds(
  {state}: StoreContext<SyncTransactionState>,
  handles: DocumentHandleLike[],
): () => void {
  const documentIds = getDocumentIdsFromHandleLikes(handles)

  const subscriptionId = insecureRandomId()
  state.set('addSubscribers', (prev) =>
    documentIds.reduce(
      (acc, id) => addSubscriptionIdToDocument(acc, id, subscriptionId),
      prev as SyncTransactionState,
    ),
  )

  return () => {
    setCleanupTimeout(() => {
      state.set('removeSubscribers', (prev) =>
        documentIds.reduce(
          (acc, id) => removeSubscriptionIdFromDocument(acc, id, subscriptionId),
          prev as SyncTransactionState,
        ),
      )
    }, DOCUMENT_STATE_CLEAR_DELAY)
  }
}

// document handles are passed in via the public facing API, but we also need to
// pull the correct document ids from action bodies, which have similar but not
// identical shapes to the document handles. release actions also flow through
// here, and resolve to the underlying release document id.
function getDocumentIdsFromHandleLikes(handles: (DocumentHandleLike | Action)[]): string[] {
  return handles.flatMap((handle) => {
    if ('type' in handle && isReleaseAction(handle)) {
      return [getReleaseDocumentId(handle.releaseId)]
    }
    const idsForDocument = []
    if (!handle.documentId) return []
    if (handle.liveEdit) {
      return [handle.documentId]
    }
    if (isReleasePerspective(handle.perspective)) {
      idsForDocument.push(
        getVersionId(DocumentId(handle.documentId), handle.perspective.releaseName),
      )
    }
    idsForDocument.push(getPublishedId(DocumentId(handle.documentId)))
    idsForDocument.push(getDraftId(DocumentId(handle.documentId)))
    return idsForDocument
  })
}

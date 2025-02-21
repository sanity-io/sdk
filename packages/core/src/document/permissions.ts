import {type SanityDocument} from '@sanity/types'
import {evaluateSync, type ExprNode, parse} from 'groq-js'
import {createSelector} from 'reselect'

import {getDraftId, getPublishedId} from '../utils/ids'
import {MultiKeyWeakMap} from '../utils/MultiKeyWeakMap'
import {type DocumentAction} from './actions'
import {ActionError, PermissionActionError, processActions} from './processActions'
import {type DocumentSet} from './processMutations'
import {type SyncTransactionState} from './reducers'

export type Grant = 'read' | 'update' | 'create' | 'history'

export type DatasetAcl = {
  filter: string
  permissions: Grant[]
}[]

export function createGrantsLookup(datasetAcl: DatasetAcl): Record<Grant, ExprNode> {
  const filtersByGrant: Record<Grant, Set<string>> = {
    create: new Set(),
    history: new Set(),
    read: new Set(),
    update: new Set(),
  }

  for (const entry of datasetAcl) {
    for (const grant of entry.permissions) {
      const set = filtersByGrant[grant]
      set.add(entry.filter)
      filtersByGrant[grant] = set
    }
  }

  return Object.fromEntries(
    Object.entries(filtersByGrant).map(([grant, filters]) => {
      const combinedFilter = Array.from(filters)
        .map((i) => `(${i})`)
        .join('||')

      if (!combinedFilter) return [grant]
      return [grant, parse(`$document {"_": ${combinedFilter}}._`)]
    }),
  ) as Record<Grant, ExprNode>
}

// Cache for documents based on an array of document objects.
const documentsCache = new MultiKeyWeakMap<DocumentSet>()
// Use a WeakMap so that when a computed DocumentSet is no longer in use,
// its nested cache for actions can be garbage-collected.
const actionsCache = new WeakMap<DocumentSet, Map<string, DocumentAction[]>>()

const nullReplacer: object = {}

// Compute documents from state and actions.
// (If the same documents are computed, the MultiKeyWeakMap will return the same instance.)
const documentsSelector = createSelector(
  [
    ({documentStates}: SyncTransactionState) => documentStates,
    (_state: SyncTransactionState, actions: DocumentAction | DocumentAction[]) => actions,
  ],
  (documentStates, actions) => {
    const documentIds = new Set(
      (Array.isArray(actions) ? actions : [actions])
        .map((i) => i.documentId)
        .filter((i) => typeof i === 'string')
        .flatMap((documentId) => [getPublishedId(documentId), getDraftId(documentId)]),
    )

    const documents: DocumentSet = {}

    for (const documentId of documentIds) {
      const local = documentStates[documentId]?.local

      // early exist if we don't have all the documents yet
      if (local === undefined) return undefined
      documents[documentId] = local
    }

    // Create a key from the documents values (using a nullReplacer when needed).
    const keys = Object.values(
      // value in this record will be `undefined` because
      // of the early return if undefined is found above
      documents as Record<string, SanityDocument | null>,
    ).map((doc) => (doc === null ? nullReplacer : doc))
    const cached = documentsCache.get(keys)
    if (cached) return cached

    documentsCache.set(keys, documents)
    return documents
  },
)

// Cache the actions array based on a serialized version, but “attach” the cache
// to the computed documents. That way if the computed documents object is no longer in use,
// the cache is eligible for GC.
const memoizedActionsSelector = createSelector(
  [
    documentsSelector,
    (_state: SyncTransactionState, actions: DocumentAction | DocumentAction[]) => actions,
  ],
  (documents, actions) => {
    if (!documents) return undefined

    // Get (or create) the nested Map for this computed documents.
    let nestedCache = actionsCache.get(documents)
    if (!nestedCache) {
      nestedCache = new Map<string, DocumentAction[]>()
      actionsCache.set(documents, nestedCache)
    }

    const normalizedActions = Array.isArray(actions) ? actions : [actions]

    // Use JSON.stringify to get a serialized key for the actions.
    // (You could swap this out for a more efficient or stable hash if desired.)
    const actionsKey = JSON.stringify(normalizedActions)
    const cached = nestedCache.get(actionsKey)
    if (cached) return cached

    nestedCache.set(actionsKey, normalizedActions)
    return normalizedActions
  },
)

function checkGrant(grantExpr: ExprNode, document: SanityDocument): boolean {
  return evaluateSync(grantExpr, {params: {document}}).get()
}

export interface PermissionDeniedReason {
  type: 'precondition' | 'access'
  message: string
  documentId?: string
}

export type PermissionsResult =
  | {
      allowed: false
      message: string
      reasons: PermissionDeniedReason[]
    }
  | {allowed: true; message?: undefined; reasons?: undefined}

const enNarrowConjunction = new Intl.ListFormat('en', {style: 'narrow', type: 'conjunction'})

export const calculatePermissions = createSelector(
  [({grants}: SyncTransactionState) => grants, documentsSelector, memoizedActionsSelector],
  (
    grants: Record<Grant, ExprNode> | undefined,
    documents: DocumentSet | undefined,
    actions: DocumentAction[] | undefined,
  ): PermissionsResult | undefined => {
    if (!documents) return undefined
    if (!grants) return undefined
    if (!actions) return undefined

    const timestamp = new Date().toISOString()
    const reasons: PermissionDeniedReason[] = []

    try {
      processActions({
        actions,
        transactionId: crypto.randomUUID(),
        working: documents,
        base: documents,
        timestamp,
        grants,
      })
    } catch (error) {
      if (error instanceof PermissionActionError) {
        reasons.push({
          message: error.message,
          documentId: error.documentId,
          type: 'access',
        })
      }
      if (error instanceof ActionError) {
        reasons.push({
          message: error.message,
          documentId: error.documentId,
          type: 'precondition',
        })
      } else {
        throw error
      }
    }

    for (const action of actions) {
      // Check read actions
      if (action.type === 'document.read') {
        if (action.documentId) {
          const doc = documents[action.documentId]
          if (!doc) {
            reasons.push({
              type: 'precondition',
              message: `The document with ID "${action.documentId}" could not be found. Please ensure it exists before attempting to read it.`,
              documentId: action.documentId,
            })
          } else if (!checkGrant(grants.read, doc)) {
            reasons.push({
              type: 'access',
              message: `You are not allowed to view the document with ID "${action.documentId}".`,
              documentId: action.documentId,
            })
          }
        } else {
          const dummyDoc: SanityDocument = {
            _id: getDraftId(crypto.randomUUID()),
            _type: action.documentType,
            _rev: 'dummy-rev',
            _createdAt: timestamp,
            _updatedAt: timestamp,
          }
          if (!checkGrant(grants.read, dummyDoc)) {
            reasons.push({
              type: 'access',
              message: `You do not have permission to view documents of type "${action.documentType}".`,
            })
          }
        }
      }

      // Check edit actions with no patches
      if (action.type === 'document.edit' && !action.patches?.length) {
        const docId = action.documentId
        const doc = documents[getDraftId(docId)] ?? documents[getPublishedId(docId)]
        if (!doc) {
          reasons.push({
            type: 'precondition',
            message: `The document with ID "${docId}" could not be found. Please check that it exists before editing.`,
            documentId: docId,
          })
        } else if (!checkGrant(grants.update, doc)) {
          reasons.push({
            type: 'access',
            message: `You are not allowed to edit the document with ID "${docId}".`,
            documentId: docId,
          })
        }
      }
    }

    const allowed = reasons.length === 0
    if (allowed) return {allowed}

    const sortedReasons = reasons
      .map((reason, index) => ({...reason, index}))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'access' ? -1 : 1
        return a.message.localeCompare(b.message, 'en-US')
      })
      .map(({index: _index, ...reason}) => reason)

    return {
      allowed,
      reasons: sortedReasons,
      message: enNarrowConjunction.format(sortedReasons.map((i) => i.message)),
    }
  },
)

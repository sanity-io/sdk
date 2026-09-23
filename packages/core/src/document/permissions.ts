import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'
import {type SanityDocument} from '@sanity/types'
import {type ExprNode, parse} from 'groq-js'
import {createSelector} from 'reselect'

import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type SelectorContext} from '../store/createStateSourceAction'
import {randomId} from '../utils/ids'
import {MultiKeyWeakMap} from '../utils/MultiKeyWeakMap'
import {type DocumentAction} from './actions'
import {ActionError, PermissionActionError, processActions} from './processActions/processActions'
import {checkGrant} from './processActions/shared'
import {type DocumentSet} from './processMutations'
import {
  getVariantCandidateKeys,
  resolveVariantIds,
  resolveVariantKey,
  type VariantTrackingState,
} from './variantTracking'

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
      // Ignore permissions we don't model (e.g. "manage")
      if (!set) continue
      set.add(entry.filter)
      filtersByGrant[grant] = set
    }
  }

  return Object.fromEntries(
    Object.entries(filtersByGrant).map(([grant, filters]) => {
      const combinedFilter = Array.from(filters)
        .map((i) => `(${i})`)
        .join('||')

      if (!combinedFilter) return [grant, parse('false')]
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
    ({state: {documentStates}}: SelectorContext<VariantTrackingState>) => documentStates,
    ({state: {variantIndex}}: SelectorContext<VariantTrackingState>) => variantIndex,
    (_context: SelectorContext<VariantTrackingState>, {actions}: {actions: DocumentAction[]}) =>
      actions,
  ],
  (documentStates, variantIndex, actions) => {
    const documentIds = new Set<string>()
    for (const action of actions) {
      const ids = getActionDocumentIds(action, {documentStates, variantIndex})
      // an unresolved variant key means we don't yet know whether the document
      // exists, so wait
      if (ids === undefined) return undefined
      ids.forEach((id) => documentIds.add(id))
    }

    const documents: DocumentSet = {}

    for (const documentId of documentIds) {
      const local = documentStates[documentId]?.local

      // early exit if we don't have all the documents yet
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

/**
 * The document ids a permission check on an action must have loaded. liveEdit
 * documents have no drafts, so only the single document is needed; standard
 * documents need draft and published, plus the release version and any variant
 * documents the action's perspective and variant address. Returns `undefined`
 * while a variant key is still unresolved.
 */
function getActionDocumentIds(
  action: DocumentAction,
  state: Pick<VariantTrackingState, 'variantIndex' | 'documentStates'>,
): string[] | undefined {
  if (typeof action.documentId !== 'string') return []
  if (action.liveEdit) return [action.documentId]

  const documentId = DocumentId(action.documentId)
  const ids: string[] = [getPublishedId(documentId), getDraftId(documentId)]
  if (isReleasePerspective(action.perspective)) {
    ids.push(getVersionId(documentId, action.perspective.releaseName))
  }
  for (const key of getActionVariantKeys(action)) {
    const resolved = resolveVariantKey(state, key)
    if (resolved === undefined) return undefined
    if (resolved !== null) ids.push(resolved)
  }
  return ids
}

function getActionVariantKeys(action: DocumentAction): string[] {
  if (typeof action.documentId !== 'string') return []
  return getVariantCandidateKeys({...action, documentId: action.documentId})
}

// Cache the actions array based on a serialized version, but “attach” the cache
// to the computed documents. That way if the computed documents object is no longer in use,
// the cache is eligible for GC.
const memoizedActionsSelector = createSelector(
  [
    documentsSelector,
    (_state: SelectorContext<VariantTrackingState>, {actions}: {actions: DocumentAction[]}) =>
      actions,
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
    // TODO: considering swapping thisfor a more efficient or stable hash
    const actionsKey = JSON.stringify(normalizedActions)
    const cached = nestedCache.get(actionsKey)
    if (cached) return cached

    nestedCache.set(actionsKey, normalizedActions)
    return normalizedActions
  },
)

/** @beta */
export interface PermissionDeniedReason {
  type: 'precondition' | 'access'
  message: string
  documentId?: string
}

/** @beta */
export type DocumentPermissionsResult =
  | {
      allowed: false
      message: string
      reasons: PermissionDeniedReason[]
    }
  | {allowed: true; message?: undefined; reasons?: undefined}

const enNarrowConjunction = new Intl.ListFormat('en', {style: 'narrow', type: 'conjunction'})

export function calculatePermissions(
  ...args: Parameters<typeof _calculatePermissions>
): ReturnType<typeof _calculatePermissions> {
  return _calculatePermissions(...args)
}

const _calculatePermissions = createSelector(
  [
    ({state: {grants}}: SelectorContext<VariantTrackingState>) => grants,
    ({state: {identity}}: SelectorContext<VariantTrackingState>) => identity,
    documentsSelector,
    memoizedActionsSelector,
    ({state: {variantIndex}}: SelectorContext<VariantTrackingState>) => variantIndex,
  ],
  (
    grants: Record<Grant, ExprNode> | undefined,
    identity: string | undefined,
    documents: DocumentSet | undefined,
    actions: DocumentAction[] | undefined,
    variantIndex: VariantTrackingState['variantIndex'],
  ): DocumentPermissionsResult | undefined => {
    if (!documents) return undefined
    if (!grants) return undefined
    if (!actions) return undefined
    // variant documents are addressed by store key, which the handlers can't
    // derive from the actions themselves
    const variants = resolveVariantIds({variantIndex}, actions.flatMap(getActionVariantKeys))
    if (!variants) return undefined

    const timestamp = new Date().toISOString()
    const reasons: PermissionDeniedReason[] = []

    try {
      processActions({
        actions,
        transactionId: randomId(16),
        working: documents,
        base: documents,
        timestamp,
        grants,
        identity,
        variantIds: variants.variantIds,
      })
    } catch (error) {
      if (error instanceof PermissionActionError) {
        reasons.push({
          message: error.message,
          documentId: error.documentId,
          type: 'access',
        })
      } else if (error instanceof ActionError) {
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
      // Check edit actions with no patches
      if (action.type === 'document.edit' && !action.patches?.length) {
        const docId = action.documentId
        let doc: SanityDocument | null | undefined
        if (action.liveEdit) {
          doc = documents[docId]
        }
        // don't allow users to edit version documents that don't exist
        // they should be explicitly created first, as in studio
        else if (isReleasePerspective(action.perspective)) {
          doc = documents[getVersionId(DocumentId(docId), action.perspective.releaseName)]
        } else {
          doc =
            documents[getDraftId(DocumentId(docId))] ?? documents[getPublishedId(DocumentId(docId))]
        }
        if (!doc) {
          if (isReleasePerspective(action.perspective)) {
            reasons.push({
              type: 'precondition',
              message: `The version document with ID "${docId}" could not be found. Please create it or add it to the release first.`,
              documentId: docId,
            })
          } else {
            reasons.push({
              type: 'precondition',
              message: `The document with ID "${docId}" could not be found. Please check that it exists before editing.`,
              documentId: docId,
            })
          }
        } else if (!checkGrant(grants.update, doc, identity)) {
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

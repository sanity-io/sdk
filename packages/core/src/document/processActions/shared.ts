import {diffValue} from '@sanity/diff-patch'
import {type Mutation, type PatchOperations, type SanityDocument} from '@sanity/types'
import {evaluateSync, type ExprNode} from 'groq-js'

import {type Grant} from '../permissions'
import {type DocumentSet, processMutations} from '../processMutations'
import {type HttpAction} from '../reducers'

export interface ActionHandlerContext {
  base: DocumentSet
  working: DocumentSet
  transactionId: string
  timestamp: string
  grants: Record<Grant, ExprNode>
  /**
   * The current user's ID, used by GROQ's `identity()` when evaluating ACL
   * filters. May be `undefined` before the user has loaded; in that case
   * `identity()` evaluates to null.
   */
  identity: string | undefined
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
}

export interface ActionHandlerResult {
  base: DocumentSet
  working: DocumentSet
}

export function checkGrant(
  grantExpr: ExprNode,
  document: SanityDocument,
  identity: string | undefined,
): boolean {
  const value = evaluateSync(grantExpr, {params: {document}, identity})
  return value.type === 'boolean' && value.data
}

interface ActionErrorOptions {
  message: string
  documentId: string
  transactionId: string
}

/**
 * Thrown when a precondition for an action failed.
 */
export class ActionError extends Error implements ActionErrorOptions {
  documentId!: string
  transactionId!: string

  constructor(options: ActionErrorOptions) {
    super(options.message)
    Object.assign(this, options)
  }
}

export class PermissionActionError extends ActionError {}

/**
 * Creates a `processMutations` wrapper that surfaces application failures as
 * `ActionError`s when the caller asked to preserve their patch operations.
 * With preserved operations, patches can legitimately fail to apply (e.g.
 * re-applied onto a diverged document during a rebase), so wrapping lets a
 * rebase skip the transaction instead of failing the store. Without
 * `preserveOperations`, errors are rethrown untouched.
 */
export function createMutationApplier(options: {
  documentId: string
  transactionId: string
  timestamp: string
  preserveOperations: boolean | undefined
}): (
  documents: DocumentSet,
  mutations: Mutation[],
  documentSetName: 'base' | 'working',
) => DocumentSet {
  const {documentId, transactionId, timestamp, preserveOperations} = options
  return (documents, mutations, documentSetName) => {
    try {
      return processMutations({documents, transactionId, mutations, timestamp})
    } catch (error) {
      if (!preserveOperations) throw error
      throw new ActionError({
        documentId,
        transactionId,
        message: `Failed to apply patches to the ${documentSetName} document: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }
}

interface ApplySingleDocPatchOptions {
  base: DocumentSet
  working: DocumentSet
  documentId: string
  patches: PatchOperations[] | undefined
  transactionId: string
  timestamp: string
  grants: Record<Grant, ExprNode>
  identity: string | undefined
  /**
   * Error message thrown when the target document does not exist in either
   * the base or working set.
   */
  notFoundMessage?: string
  /**
   * Error message thrown when the working document fails the `update` grant.
   */
  permissionMessage?: string
  /**
   * When `true`, the given patches are used verbatim instead of being
   * re-derived by diffing the base document before and after application.
   * Patch application failures are surfaced as `ActionError`s so a rebase
   * can skip the transaction instead of failing the store.
   */
  preserveOperations?: boolean
}

interface ApplySingleDocPatchResult {
  base: DocumentSet
  working: DocumentSet
  /**
   * Patch operations representing the minimal diff between base before and
   * after the user's patches were applied. These are the patches that should
   * be sent to the server (or applied to the working set as mutations).
   */
  diffedPatches: PatchOperations[]
  /**
   * Mutation envelopes for `diffedPatches` already keyed to `documentId`.
   * Useful for callers that want to push them to `outgoingMutations`.
   */
  workingMutations: Mutation[]
}

/**
 * Shared logic for applying user-provided patches to a single document that
 * is identified by an exact ID (no draft/published wrapping). Used by the
 * liveEdit branch of `document.edit` and by `release.edit`.
 *
 * Returns the updated base + working sets, plus the diffed patches in both
 * raw and mutation form so the caller can decide what to send to the server.
 */
export function applySingleDocPatch({
  base: initialBase,
  working: initialWorking,
  documentId,
  patches,
  transactionId,
  timestamp,
  grants,
  identity,
  notFoundMessage = 'Cannot edit document because it does not exist.',
  permissionMessage = `You do not have permission to edit document "${documentId}".`,
  preserveOperations,
}: ApplySingleDocPatchOptions): ApplySingleDocPatchResult {
  let base = initialBase
  let working = initialWorking

  const userPatches = patches?.map((patch) => ({patch: {id: documentId, ...patch}}))

  if (!userPatches?.length) {
    return {base, working, diffedPatches: [], workingMutations: []}
  }

  if (!working[documentId] || !base[documentId]) {
    throw new ActionError({documentId, transactionId, message: notFoundMessage})
  }

  const applyMutations = createMutationApplier({
    documentId,
    transactionId,
    timestamp,
    preserveOperations,
  })

  const baseBefore = base[documentId]
  base = applyMutations(base, userPatches, 'base')
  const baseAfter = base[documentId]
  const diffedPatches = preserveOperations
    ? (patches as PatchOperations[])
    : (diffValue(baseBefore, baseAfter) as PatchOperations[])

  const workingBefore = working[documentId] as SanityDocument
  if (!checkGrant(grants.update, workingBefore, identity)) {
    throw new PermissionActionError({documentId, transactionId, message: permissionMessage})
  }

  const workingMutations: Mutation[] = diffedPatches.map((patch) => ({
    patch: {id: documentId, ...patch},
  }))

  working = applyMutations(working, workingMutations, 'working')

  return {base, working, diffedPatches, workingMutations}
}

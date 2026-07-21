import {diffValue} from '@sanity/diff-patch'
import {jsonMatch, stringifyPath} from '@sanity/json-match'
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

/**
 * Re-applies the operational intent of user-supplied `inc`/`dec` patches to a
 * set of snapshot-diffed patches.
 *
 * The outgoing patches sent to Content Lake are re-derived by diffing the
 * base document before and after the user's patches were applied. That diff
 * collapses an `inc` into a `set` of the resulting number, which turns
 * concurrent increments from different clients into last-write-wins. This
 * helper finds diffed `set` operations that are exactly explained by the
 * user's `inc`/`dec` operations and swaps them back, so the server applies
 * the increment against whatever value is current at commit time.
 *
 * A `set` is only swapped when its value equals the base value plus the
 * accumulated user deltas for that exact path; anything else (e.g. an `inc`
 * combined with a `set` of the same field) keeps the diffed `set`.
 *
 * Content Lake fails the whole transaction when `inc`/`dec` targets a missing
 * path (unlike `set`, which always succeeds). To avoid turning a concurrent
 * field removal into a transaction revert, the emitted patch seeds the target
 * with a `setIfMissing` of the base value; the server executes `setIfMissing`
 * before `inc`/`dec` within a single patch, so a concurrently removed field
 * degrades to the same result the diffed `set` would have produced. A path
 * into a concurrently removed keyed array item can still fail the
 * transaction (`setIfMissing` cannot create array items); the transaction is
 * then reverted and reported, which is preferable to silently resurrecting
 * the item.
 */
export function preserveNumericOperations(
  baseBefore: SanityDocument | null | undefined,
  userPatches: PatchOperations[] | undefined,
  diffedPatches: PatchOperations[],
): PatchOperations[] {
  if (!baseBefore || !userPatches?.length) return diffedPatches

  // accumulate the user's inc/dec deltas per concrete (stringified) path,
  // tracking the expected final value by replaying the additions in order
  const targets = new Map<string, {baseValue: number; expectedValue: number; delta: number}>()
  for (const patch of userPatches) {
    for (const [op, sign] of [
      ['inc', 1],
      ['dec', -1],
    ] as const) {
      const record = patch[op]
      if (!record) continue
      for (const [pathExpression, amount] of Object.entries(record)) {
        if (typeof amount !== 'number') continue
        for (const match of jsonMatch(baseBefore, pathExpression)) {
          const path = stringifyPath(match.path)
          const existing = targets.get(path)
          if (existing) {
            existing.expectedValue += sign * amount
            existing.delta += sign * amount
          } else if (typeof match.value === 'number') {
            targets.set(path, {
              baseValue: match.value,
              expectedValue: match.value + sign * amount,
              delta: sign * amount,
            })
          }
        }
      }
    }
  }
  if (!targets.size) return diffedPatches

  const preserved = new Map<string, {delta: number; baseValue: number}>()
  const next = diffedPatches.flatMap((patch) => {
    if (!patch.set) return [patch]

    const keptSet: Record<string, unknown> = {}
    for (const [path, value] of Object.entries(patch.set)) {
      const target = targets.get(path)
      if (target && typeof value === 'number' && value === target.expectedValue) {
        preserved.set(path, {delta: target.delta, baseValue: target.baseValue})
      } else {
        keptSet[path] = value
      }
    }

    if (Object.keys(keptSet).length === Object.keys(patch.set).length) return [patch]
    const {set: _set, ...rest} = patch
    const withKept = Object.keys(keptSet).length ? {...rest, set: keptSet} : rest
    return Object.keys(withKept).length ? [withKept] : []
  })

  if (!preserved.size) return next

  const setIfMissing: Record<string, unknown> = {}
  const inc: Record<string, number> = {}
  const dec: Record<string, number> = {}
  for (const [path, {delta, baseValue}] of preserved) {
    setIfMissing[path] = baseValue
    if (delta >= 0) inc[path] = delta
    else dec[path] = -delta
  }
  return [
    ...next,
    {
      setIfMissing,
      ...(Object.keys(inc).length && {inc}),
      ...(Object.keys(dec).length && {dec}),
    },
  ]
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
    : preserveNumericOperations(
        baseBefore,
        patches,
        diffValue(baseBefore, baseAfter) as PatchOperations[],
      )

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

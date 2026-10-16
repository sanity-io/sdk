import {diffValue} from '@sanity/diff-patch'
import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {type Mutation, type PatchOperations, type SanityDocument} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {isDeepEqual} from '../../utils/object'
import {
  type CreateDocumentAction,
  type DiscardDocumentAction,
  type DocumentAction,
  type EditDocumentAction,
  type PublishDocumentAction,
  type UnpublishDocumentAction,
} from '../actions'
import {buildVariantSystem, getBundleId, getVariantKeys} from '../documentKey'
import {type DocumentSet, getId, processMutations} from '../processMutations'
import {type HttpAction} from '../reducers'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  createMutationApplier,
  PermissionActionError,
  preserveNumericOperations,
} from './shared'

type VariantAction = DocumentAction & {variant: string}

/**
 * Whether an action targets a variant. liveEdit resources strip the variant
 * before actions reach the processors, so the two never combine here.
 */
export function isVariantAction(action: DocumentAction): action is VariantAction {
  return typeof action.variant === 'string' && !action.liveEdit
}

interface VariantTarget {
  /** The document group (published) id. */
  publishedId: string
  variantId: string
  /**
   * The bundle the action writes to: `'drafts'` or a release name. Never the
   * published bundle; see `getBundleId`.
   */
  bundleId: string
  /** Store key of the variant over the action's bundle. */
  targetId: string
  /** Store key of the variant over the published bundle. */
  publishedVariantId: string
}

function getVariantTarget(action: VariantAction, ctx: ActionHandlerContext): VariantTarget {
  const publishedId = getPublishedId(DocumentId(getId(action.documentId)))
  const keys = getVariantKeys({...action, documentId: publishedId})
  const resolve = (key: string) => {
    const id = ctx.variantIds[key]
    if (!id) {
      throw new Error(
        `Variant "${action.variant}" of "${publishedId}" was not resolved before processing. This is a bug in the document store.`,
      )
    }
    return id
  }
  return {
    publishedId,
    variantId: action.variant,
    bundleId: getBundleId(action.perspective),
    targetId: resolve(keys.overBundle),
    publishedVariantId: resolve(keys.overPublished),
  }
}

/**
 * The document a new variant is forked from when none exists yet. Content
 * Lake's `variant.edit` forks from the variant's published sibling, else the
 * published document — never from the draft or release version the user may
 * be viewing — and the local prediction must agree with it.
 */
function getForkSource(documents: DocumentSet, target: VariantTarget): SanityDocument | undefined {
  return documents[target.publishedVariantId] ?? documents[target.publishedId] ?? undefined
}

function permissionError(target: VariantTarget, transactionId: string, message: string) {
  return new PermissionActionError({documentId: target.publishedId, transactionId, message})
}

function preconditionError(target: VariantTarget, transactionId: string, message: string) {
  return new ActionError({documentId: target.publishedId, transactionId, message})
}

/**
 * Applies the same mutations to the base and working sets and records the
 * mutations and the resulting HTTP action as outgoing.
 */
function commit(
  ctx: ActionHandlerContext,
  sets: {base: DocumentSet; working: DocumentSet},
  mutations: Mutation[],
  outgoingAction: HttpAction,
): ActionHandlerResult {
  const {transactionId, timestamp, outgoingActions, outgoingMutations} = ctx
  outgoingMutations.push(...mutations)
  outgoingActions.push(outgoingAction)
  return {
    base: processMutations({documents: sets.base, transactionId, mutations, timestamp}),
    working: processMutations({documents: sets.working, transactionId, mutations, timestamp}),
  }
}

function toVariantDocument(source: SanityDocument, target: VariantTarget): SanityDocument {
  return {
    ...source,
    _id: target.targetId,
    _system: buildVariantSystem(
      {documentId: target.publishedId, variant: target.variantId},
      target.bundleId,
    ),
  }
}

export function handleVariantEdit(
  action: EditDocumentAction & VariantAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx
  const target = getVariantTarget(action, ctx)
  const {targetId, publishedId, variantId, bundleId} = target

  const userPatches = action.patches?.map((patch) => ({patch: {id: targetId, ...patch}}))
  if (!userPatches?.length) return {base, working}

  const applyMutations = createMutationApplier({
    documentId: publishedId,
    transactionId,
    timestamp,
    preserveOperations: action.preserveOperations,
  })

  const forkFrom = (documents: typeof base): SanityDocument | undefined => {
    if (documents[targetId]) return undefined
    const source = getForkSource(documents, target)
    if (!source) {
      throw preconditionError(
        target,
        transactionId,
        `Cannot edit variant "${variantId}" of document "${publishedId}" because neither the variant nor a published document exists to base it on.`,
      )
    }
    return toVariantDocument(source, target)
  }

  const baseFork = forkFrom(base)
  const baseMutations: Mutation[] = [...(baseFork ? [{create: baseFork}] : []), ...userPatches]
  const baseBefore = base[targetId] ?? baseFork
  base = applyMutations(base, baseMutations, 'base')
  const baseAfter = base[targetId] as SanityDocument

  const patches = action.preserveOperations
    ? (action.patches ?? [])
    : preserveNumericOperations(
        baseBefore,
        action.patches,
        diffValue(baseBefore, baseAfter) as PatchOperations[],
      )

  const workingFork = forkFrom(working)
  if (workingFork && !checkGrant(grants.create, workingFork, identity)) {
    throw permissionError(
      target,
      transactionId,
      `You do not have permission to create variant "${variantId}" of document "${publishedId}".`,
    )
  }
  const workingBefore = working[targetId] ?? workingFork
  if (!checkGrant(grants.update, workingBefore!, identity)) {
    throw permissionError(
      target,
      transactionId,
      `You do not have permission to edit variant "${variantId}" of document "${publishedId}".`,
    )
  }

  const workingMutations: Mutation[] = [
    ...(workingFork ? [{create: workingFork}] : []),
    ...patches.map((patch) => ({patch: {id: targetId, ...patch}})),
  ]
  working = applyMutations(working, workingMutations, 'working')

  outgoingMutations.push(...workingMutations)
  outgoingActions.push(
    ...patches.map((patch) => ({
      actionType: 'sanity.action.document.variant.edit' as const,
      publishedId,
      variantId,
      bundleId,
      patch: patch as PatchOperations,
    })),
  )

  return {base, working}
}

export function handleVariantCreate(
  action: CreateDocumentAction & VariantAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  const {base, working} = ctx
  const target = getVariantTarget(action, ctx)
  const {targetId, publishedId, variantId, bundleId} = target

  if (working[targetId]) {
    throw preconditionError(
      target,
      transactionId,
      `Variant "${variantId}" of document "${publishedId}" already exists. Please use or discard the existing variant before creating a new one.`,
    )
  }

  const build = (documents: DocumentSet) => ({
    ...getForkSource(documents, target),
    _type: action.documentType,
    ...action.initialValue,
    _id: targetId,
    _system: buildVariantSystem({documentId: publishedId, variant: variantId}, bundleId),
  })
  const newDocBase = build(base)
  const newDocWorking = build(working)

  if (!checkGrant(grants.create, newDocWorking as SanityDocument, identity)) {
    throw permissionError(
      target,
      transactionId,
      `You do not have permission to create variant "${variantId}" of document "${publishedId}".`,
    )
  }

  // the key standing in for the id must never reach Content Lake; the remote
  // derives the real id from the (publishedId, variantId, bundleId) triple
  const {_id: _omitted, _system: _system, ...document} = newDocWorking
  outgoingMutations.push({create: newDocWorking})
  outgoingActions.push({
    actionType: 'sanity.action.document.variant.create',
    publishedId,
    variantId,
    bundleId,
    document,
  })
  return {
    base: processMutations({
      documents: base,
      transactionId,
      mutations: [{create: newDocBase}],
      timestamp,
    }),
    working: processMutations({
      documents: working,
      transactionId,
      mutations: [{create: newDocWorking}],
      timestamp,
    }),
  }
}

export function handleVariantDiscard(
  action: DiscardDocumentAction & VariantAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, grants, identity, working} = ctx
  const target = getVariantTarget(action, ctx)
  const {targetId, publishedId, variantId, bundleId} = target

  if (!working[targetId]) {
    throw preconditionError(
      target,
      transactionId,
      `There is no variant "${variantId}" of document "${publishedId}" to discard.`,
    )
  }
  if (!checkGrant(grants.update, working[targetId], identity)) {
    throw permissionError(
      target,
      transactionId,
      `You do not have permission to discard variant "${variantId}" of document "${publishedId}".`,
    )
  }

  return commit(ctx, ctx, [{delete: {id: targetId}}], {
    actionType: 'sanity.action.document.variant.delete',
    publishedId,
    variantId,
    bundleId,
  })
}

/**
 * Publishes the variant: the variant over the action's bundle replaces the
 * variant over the published bundle. The document group's own published
 * document is untouched.
 */
export function handleVariantPublish(
  action: PublishDocumentAction & VariantAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, grants, identity, base, working} = ctx
  const target = getVariantTarget(action, ctx)
  const {targetId, publishedVariantId, publishedId, variantId, bundleId} = target

  const workingSource = working[targetId]
  const baseSource = base[targetId]
  if (!workingSource || !baseSource) {
    throw preconditionError(
      target,
      transactionId,
      `Cannot publish because variant "${variantId}" of document "${publishedId}" has no unpublished changes.`,
    )
  }
  if (!isDeepEqual(workingSource, baseSource)) {
    throw preconditionError(
      target,
      transactionId,
      `Publish aborted: The document has changed elsewhere. Please try again.`,
    )
  }

  const newPublishedVariant: SanityDocument = {
    ...workingSource,
    _id: publishedVariantId,
    _system: buildVariantSystem({documentId: publishedId, variant: variantId}, undefined),
  }

  if (!checkGrant(grants.update, workingSource, identity)) {
    throw permissionError(
      target,
      transactionId,
      `Publish failed: You do not have permission to update variant "${variantId}" of "${publishedId}".`,
    )
  }
  const grant = working[publishedVariantId] ? grants.update : grants.create
  if (!checkGrant(grant, newPublishedVariant, identity)) {
    throw permissionError(
      target,
      transactionId,
      `Publish failed: You do not have permission to publish variant "${variantId}" of "${publishedId}".`,
    )
  }

  return commit(ctx, ctx, [{delete: {id: targetId}}, {createOrReplace: newPublishedVariant}], {
    actionType: 'sanity.action.document.variant.publish',
    publishedId,
    variantId,
    bundleId,
  })
}

/**
 * Unpublishes the variant: the variant over the published bundle is removed
 * and preserved as the variant over drafts.
 */
export function handleVariantUnpublish(
  action: UnpublishDocumentAction & VariantAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, grants, identity, base, working} = ctx
  const target = getVariantTarget(action, ctx)
  const {targetId, publishedVariantId, publishedId, variantId} = target

  if (isReleasePerspective(action.perspective)) {
    throw preconditionError(
      target,
      transactionId,
      `Cannot unpublish variant "${variantId}" of document "${publishedId}" through a release perspective.`,
    )
  }
  // outside a release perspective the action's bundle is drafts, so the
  // target is where the unpublished variant is preserved
  const draftVariantId = targetId

  const source = working[publishedVariantId] ?? base[publishedVariantId]
  if (!source) {
    throw preconditionError(
      target,
      transactionId,
      `Cannot unpublish because variant "${variantId}" of document "${publishedId}" is not currently published.`,
    )
  }

  const newDraftVariant: SanityDocument = {
    ...source,
    _id: draftVariantId,
    _system: buildVariantSystem({documentId: publishedId, variant: variantId}, 'drafts'),
  }

  if (!checkGrant(grants.update, source, identity)) {
    throw permissionError(
      target,
      transactionId,
      `You do not have permission to unpublish variant "${variantId}" of document "${publishedId}".`,
    )
  }
  if (!working[draftVariantId] && !checkGrant(grants.create, newDraftVariant, identity)) {
    throw permissionError(
      target,
      transactionId,
      `You do not have permission to create a draft of variant "${variantId}" of document "${publishedId}".`,
    )
  }

  return commit(
    ctx,
    ctx,
    [{delete: {id: publishedVariantId}}, {createIfNotExists: newDraftVariant}],
    {actionType: 'sanity.action.document.variant.unpublish', publishedId, variantId},
  )
}

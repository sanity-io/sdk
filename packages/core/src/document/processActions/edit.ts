import {diffValue} from '@sanity/diff-patch'
import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'
import {type Mutation, type PatchOperations, type SanityDocument} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {type EditDocumentAction} from '../actions'
import {getId, processMutations} from '../processMutations'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  applySingleDocPatch,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleEdit(
  action: EditDocumentAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx

  const documentId = getId(action.documentId)

  if (action.liveEdit) {
    const result = applySingleDocPatch({
      base,
      working,
      documentId,
      patches: action.patches,
      transactionId,
      timestamp,
      grants,
      identity,
    })
    // liveEdit documents use the mutation endpoint directly -- we don't send actions
    outgoingMutations.push(...result.workingMutations)
    return {base: result.base, working: result.working}
  }

  const versionId = isReleasePerspective(action.perspective)
    ? getVersionId(DocumentId(documentId), action.perspective.releaseName)
    : undefined
  const draftId = getDraftId(DocumentId(documentId))
  const publishedId = getPublishedId(DocumentId(documentId))
  const patchDocumentId = isReleasePerspective(action.perspective) ? versionId! : draftId
  const userPatches = action.patches?.map((patch) => ({
    patch: {id: patchDocumentId, ...patch},
  }))

  // skip this action if there are no associated patches
  if (!userPatches?.length) return {base, working}

  if (isReleasePerspective(action.perspective)) {
    if (!working[versionId!] && !base[versionId!]) {
      throw new ActionError({
        documentId,
        transactionId,
        message: `This document does not exist in the release. Please create it or add it to the release first.`,
      })
    }
  } else if (
    (!working[draftId] && !working[publishedId]) ||
    (!base[draftId] && !base[publishedId])
  ) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot edit document because it does not exist in draft or published form.`,
    })
  }

  const baseMutations: Mutation[] = []
  // don't create a draft from the published version in a release perspective
  if (!isReleasePerspective(action.perspective) && !base[draftId] && base[publishedId]) {
    // otherwise make a draft from the published version
    baseMutations.push({create: {...base[publishedId], _id: draftId}})
  }

  // the above statement and guards should make this never be null or undefined
  const baseBefore = base[patchDocumentId] ?? base[publishedId]
  if (userPatches) {
    baseMutations.push(...userPatches)
  }

  base = processMutations({
    documents: base,
    transactionId,
    mutations: baseMutations,
    timestamp,
  })
  // this one will always be defined because a patch mutation will never
  // delete an input document
  const baseAfter = base[patchDocumentId] as SanityDocument
  const patches = diffValue(baseBefore, baseAfter)

  const workingMutations: Mutation[] = []
  if (!isReleasePerspective(action.perspective) && !working[draftId] && working[publishedId]) {
    const newDraftFromPublished = {...working[publishedId], _id: draftId}

    if (!checkGrant(grants.create, newDraftFromPublished, identity)) {
      throw new PermissionActionError({
        documentId,
        transactionId,
        message: `You do not have permission to create a draft for editing this document.`,
      })
    }

    workingMutations.push({create: newDraftFromPublished})
  }

  // the first if statement should make this never be null or undefined
  const workingBefore = working[patchDocumentId] ?? working[publishedId]
  if (!checkGrant(grants.update, workingBefore!, identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to edit document "${documentId}".`,
    })
  }
  workingMutations.push(...patches.map((patch) => ({patch: {id: patchDocumentId, ...patch}})))

  working = processMutations({
    documents: working,
    transactionId,
    mutations: workingMutations,
    timestamp,
  })

  outgoingMutations.push(...workingMutations)
  outgoingActions.push(
    ...patches.map((patch) => ({
      actionType: 'sanity.action.document.edit' as const,
      draftId: patchDocumentId,
      publishedId,
      patch: patch as PatchOperations,
    })),
  )

  return {base, working}
}

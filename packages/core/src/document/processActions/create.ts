import {DocumentId, getDraftId, getPublishedId, getVersionId} from '@sanity/id-utils'
import {type Mutation, type SanityDocument} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {type CreateDocumentAction} from '../actions'
import {getId, processMutations} from '../processMutations'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleCreate(
  action: CreateDocumentAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx

  const documentId = getId(action.documentId)

  if (action.liveEdit) {
    if (working[documentId]) {
      throw new ActionError({
        documentId,
        transactionId,
        message: `This document already exists.`,
      })
    }

    const newDocBase = {_type: action.documentType, _id: documentId, ...action.initialValue}
    const newDocWorking = {
      _type: action.documentType,
      _id: documentId,
      ...action.initialValue,
    }
    const mutations: Mutation[] = [{create: newDocWorking}]

    base = processMutations({
      documents: base,
      transactionId,
      mutations: [{create: newDocBase}],
      timestamp,
    })
    working = processMutations({
      documents: working,
      transactionId,
      mutations,
      timestamp,
    })

    if (!checkGrant(grants.create, working[documentId] as SanityDocument, identity)) {
      throw new PermissionActionError({
        documentId,
        transactionId,
        message: `You do not have permission to create document "${documentId}".`,
      })
    }

    // liveEdit documents use the mutation endpoint directly -- we don't send actions
    outgoingMutations.push(...mutations)
    return {base, working}
  }

  // Standard draft/published/version logic
  const versionId = isReleasePerspective(action.perspective)
    ? getVersionId(DocumentId(documentId), action.perspective.releaseName)
    : undefined
  const draftId = getDraftId(DocumentId(documentId))
  const publishedId = getPublishedId(DocumentId(documentId))

  const alreadyHasVersion = versionId ? working[versionId] : working[draftId]

  if (alreadyHasVersion) {
    const errorDocType = versionId ? 'release version' : 'draft'
    throw new ActionError({
      documentId,
      transactionId,
      message: `A ${errorDocType} of this document already exists. Please use or discard the existing ${errorDocType} before creating a new one.`,
    })
  }

  // Spread the (possibly undefined) draft or published version directly.
  // (studio uses the draft version as a base if you are in a release perspective)
  const newDocBase = {
    ...(base[draftId] ?? base[publishedId]),
    _type: action.documentType,
    _id: versionId ?? draftId,
    ...action.initialValue,
  }
  const newDocWorking = {
    ...(working[draftId] ?? working[publishedId]),
    _type: action.documentType,
    _id: versionId ?? draftId,
    ...action.initialValue,
  }
  const mutations: Mutation[] = [{create: newDocWorking}]

  base = processMutations({
    documents: base,
    transactionId,
    mutations: [{create: newDocBase}],
    timestamp,
  })
  working = processMutations({
    documents: working,
    transactionId,
    mutations,
    timestamp,
  })

  if (versionId && !checkGrant(grants.create, working[versionId] as SanityDocument, identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to create a release version for document "${documentId}".`,
    })
  } else if (
    !versionId &&
    !checkGrant(grants.create, working[draftId] as SanityDocument, identity)
  ) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to create a draft for document "${documentId}".`,
    })
  }

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.document.version.create',
    publishedId,
    attributes: newDocWorking,
  })
  return {base, working}
}

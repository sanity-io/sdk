import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'
import {type Mutation, type SanityDocument} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {type UnpublishDocumentAction} from '../actions'
import {getId, processMutations} from '../processMutations'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleUnpublish(
  action: UnpublishDocumentAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx

  const documentId = getId(action.documentId)

  if (action.liveEdit || isReleasePerspective(action.perspective)) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot unpublish this document. Unpublishing is not supported for liveEdit or version (release) documents.`,
    })
  }

  // Standard draft/published or version logic
  const draftId = getDraftId(DocumentId(documentId))
  const publishedId = getPublishedId(DocumentId(documentId))

  if (!working[publishedId] && !base[publishedId]) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot unpublish because the document "${documentId}" is not currently published.`,
    })
  }

  const sourceDoc = working[publishedId] ?? (base[publishedId] as SanityDocument)
  const newDraftFromPublished = {...sourceDoc, _id: draftId}
  const mutations: Mutation[] = [
    {delete: {id: publishedId}},
    {createIfNotExists: newDraftFromPublished},
  ]

  if (!checkGrant(grants.update, sourceDoc, identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to unpublish the document "${documentId}".`,
    })
  }

  if (!working[draftId] && !checkGrant(grants.create, newDraftFromPublished, identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to create a draft from the published version of "${documentId}".`,
    })
  }

  base = processMutations({
    documents: base,
    transactionId,
    mutations: [
      {delete: {id: publishedId}},
      {createIfNotExists: {...(base[publishedId] ?? sourceDoc), _id: draftId}},
    ],
    timestamp,
  })
  working = processMutations({documents: working, transactionId, mutations, timestamp})

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.document.unpublish',
    draftId,
    publishedId,
  })
  return {base, working}
}

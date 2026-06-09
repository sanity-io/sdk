import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'
import {type Mutation} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {type DeleteDocumentAction} from '../actions'
import {processMutations} from '../processMutations'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleDelete(
  action: DeleteDocumentAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx

  const documentId = action.documentId

  if (isReleasePerspective(action.perspective)) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot delete a version document. You may want to use the "unpublish" or "discard" actions instead.`,
    })
  }

  if (action.liveEdit) {
    if (!working[documentId]) {
      throw new ActionError({
        documentId,
        transactionId,
        message: 'The document you are trying to delete does not exist.',
      })
    }

    if (!checkGrant(grants.update, working[documentId], identity)) {
      throw new PermissionActionError({
        documentId,
        transactionId,
        message: `You do not have permission to delete this document.`,
      })
    }

    const mutations: Mutation[] = [{delete: {id: documentId}}]

    base = processMutations({documents: base, transactionId, mutations, timestamp})
    working = processMutations({documents: working, transactionId, mutations, timestamp})

    // although liveEdit documents can use the actions API for deletion,
    // having this be an action while other operations are mutations creates an inconsistency
    // (and a possible race condition in document store where mutations might get skipped)
    outgoingMutations.push(...mutations)
    return {base, working}
  }

  // Standard draft/published logic
  const draftId = getDraftId(DocumentId(documentId))
  const publishedId = getPublishedId(DocumentId(documentId))

  if (!working[publishedId]) {
    throw new ActionError({
      documentId,
      transactionId,
      message: working[draftId]
        ? 'Cannot delete a document without a published version.'
        : 'The document you are trying to delete does not exist.',
    })
  }

  const cantDeleteDraft = working[draftId] && !checkGrant(grants.update, working[draftId], identity)
  const cantDeletePublished =
    working[publishedId] && !checkGrant(grants.update, working[publishedId], identity)

  if (cantDeleteDraft || cantDeletePublished) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to delete this document.`,
    })
  }

  const mutations: Mutation[] = [{delete: {id: publishedId}}, {delete: {id: draftId}}]
  const includeDrafts = working[draftId] ? [draftId] : undefined

  base = processMutations({documents: base, transactionId, mutations, timestamp})
  working = processMutations({documents: working, transactionId, mutations, timestamp})

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.document.delete',
    publishedId,
    ...(includeDrafts ? {includeDrafts} : {}),
  })
  return {base, working}
}

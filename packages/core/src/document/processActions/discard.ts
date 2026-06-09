import {DocumentId, getDraftId, getVersionId} from '@sanity/id-utils'
import {type Mutation} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {type DiscardDocumentAction} from '../actions'
import {getId, processMutations} from '../processMutations'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleDiscard(
  action: DiscardDocumentAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx

  const documentId = getId(action.documentId)

  if (action.liveEdit) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot discard changes for liveEdit document "${documentId}". LiveEdit documents do not support drafts.`,
    })
  }

  // draft/published or version logic
  const versionId = isReleasePerspective(action.perspective)
    ? getVersionId(DocumentId(documentId), action.perspective.releaseName)
    : getDraftId(DocumentId(documentId))
  const mutations: Mutation[] = [{delete: {id: versionId}}]

  if (!working[versionId]) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `There is no draft or version available to discard for document "${documentId}".`,
    })
  }

  if (!checkGrant(grants.update, working[versionId], identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `You do not have permission to discard changes for document "${documentId}".`,
    })
  }

  base = processMutations({documents: base, transactionId, mutations, timestamp})
  working = processMutations({documents: working, transactionId, mutations, timestamp})

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.document.version.discard',
    versionId,
  })
  return {base, working}
}

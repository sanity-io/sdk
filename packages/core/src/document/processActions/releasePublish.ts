import {type PublishReleaseAction} from '../actions'
import {getReleaseDocumentId} from './releaseUtil'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleReleasePublish(
  action: PublishReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {base, working, grants, outgoingActions, transactionId, identity} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)
  const existing = working[releaseDocumentId] ?? base[releaseDocumentId]
  if (!existing) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot publish release "${action.releaseId}" because it does not exist.`,
    })
  }

  if (!checkGrant(grants.update, existing, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to publish release "${action.releaseId}".`,
    })
  }

  // a release publish cascades to every version document in the release
  // although technically we could search through the document store for all related
  // version documents, for now it's simpler to just let the server handle it.
  // (Those local documents will be eventually updated by the listener.)
  outgoingActions.push({
    actionType: 'sanity.action.release.publish',
    releaseId: action.releaseId,
  })

  return {base, working}
}

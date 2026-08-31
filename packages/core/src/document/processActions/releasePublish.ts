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

  // A release publish cascades to every version document in the release. Those
  // are left to the server rather than searched for in the document store; the
  // listener updates the local copies.
  outgoingActions.push({
    actionType: 'sanity.action.release.publish',
    releaseId: action.releaseId,
  })

  return {base, working}
}

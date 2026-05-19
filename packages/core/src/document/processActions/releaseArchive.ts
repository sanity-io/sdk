import {type ArchiveReleaseAction, type UnarchiveReleaseAction} from '../actions'
import {getReleaseDocumentId} from './releaseUtil'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleReleaseArchive(
  action: ArchiveReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {base, working, grants, outgoingActions, transactionId, identity} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)
  const existing = working[releaseDocumentId] ?? base[releaseDocumentId]
  if (!existing) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot archive release "${action.releaseId}" because it does not exist.`,
    })
  }

  if (!checkGrant(grants.update, existing, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to archive release "${action.releaseId}".`,
    })
  }

  // Archiving deletes every version document in the release server-side.
  // Although technically we could search through the document store for all related
  // version documents, for now it's simpler to just let the server handle it.
  // (Those local documents will be eventually updated by the listener.)
  outgoingActions.push({
    actionType: 'sanity.action.release.archive',
    releaseId: action.releaseId,
  })

  return {base, working}
}

export function handleReleaseUnarchive(
  action: UnarchiveReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {base, working, grants, outgoingActions, transactionId, identity} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)
  const existing = working[releaseDocumentId] ?? base[releaseDocumentId]
  if (!existing) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot unarchive release "${action.releaseId}" because it does not exist.`,
    })
  }

  if (!checkGrant(grants.update, existing, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to unarchive release "${action.releaseId}".`,
    })
  }

  outgoingActions.push({
    actionType: 'sanity.action.release.unarchive',
    releaseId: action.releaseId,
  })

  return {base, working}
}

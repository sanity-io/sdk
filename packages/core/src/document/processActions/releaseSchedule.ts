import {type ScheduleReleaseAction, type UnscheduleReleaseAction} from '../actions'
import {getReleaseDocumentId} from './releaseUtil'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleReleaseSchedule(
  action: ScheduleReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {base, working, grants, outgoingActions, transactionId, identity} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)

  if (Number.isNaN(Date.parse(action.publishAt))) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot schedule release "${action.releaseId}": "publishAt" must be a valid ISO 8601 timestamp (received "${action.publishAt}").`,
    })
  }

  const existing = working[releaseDocumentId] ?? base[releaseDocumentId]
  if (!existing) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot schedule release "${action.releaseId}" because it does not exist.`,
    })
  }

  if (!checkGrant(grants.update, existing, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to schedule release "${action.releaseId}".`,
    })
  }

  // Scheduling flips `state` to 'scheduled' and locks version documents
  // server-side. We don't model the lock locally yet — local edits to those
  // version docs will be rejected at submit time. The listener will sync the
  // updated release state.
  outgoingActions.push({
    actionType: 'sanity.action.release.schedule',
    releaseId: action.releaseId,
    publishAt: action.publishAt,
  })

  return {base, working}
}

export function handleReleaseUnschedule(
  action: UnscheduleReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {base, working, grants, outgoingActions, transactionId, identity} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)
  const existing = working[releaseDocumentId] ?? base[releaseDocumentId]
  if (!existing) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot unschedule release "${action.releaseId}" because it does not exist.`,
    })
  }

  if (!checkGrant(grants.update, existing, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to unschedule release "${action.releaseId}".`,
    })
  }

  outgoingActions.push({
    actionType: 'sanity.action.release.unschedule',
    releaseId: action.releaseId,
  })

  return {base, working}
}

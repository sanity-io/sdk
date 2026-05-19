import {type EditReleaseAction} from '../actions'
import {getReleaseDocumentId} from './releaseUtil'
import {type ActionHandlerContext, type ActionHandlerResult, applySingleDocPatch} from './shared'

export function handleReleaseEdit(
  action: EditReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, outgoingActions, outgoingMutations, identity} = ctx
  const {base, working} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)

  const result = applySingleDocPatch({
    base,
    working,
    documentId: releaseDocumentId,
    patches: [action.patch],
    transactionId,
    timestamp,
    grants,
    identity,
    notFoundMessage: `Cannot edit release "${action.releaseId}" because it does not exist.`,
    permissionMessage: `You do not have permission to edit release "${action.releaseId}".`,
  })

  outgoingMutations.push(...result.workingMutations)
  outgoingActions.push(
    ...result.diffedPatches.map((patch) => ({
      actionType: 'sanity.action.release.edit' as const,
      releaseId: action.releaseId,
      patch,
    })),
  )

  return {base: result.base, working: result.working}
}

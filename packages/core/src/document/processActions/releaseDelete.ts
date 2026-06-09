import {type Mutation} from '@sanity/types'

import {type DeleteReleaseAction} from '../actions'
import {processMutations} from '../processMutations'
import {getReleaseDocumentId} from './releaseUtil'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

// you can only delete archived or published releases
// https://www.sanity.io/docs/content-lake/dispatch-actions#k22ab37420f3c
const DELETABLE_STATES = new Set(['archived', 'published'])

export function handleReleaseDelete(
  action: DeleteReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, outgoingActions, outgoingMutations, identity} = ctx
  let {base, working} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)
  const existing = working[releaseDocumentId] ?? base[releaseDocumentId]

  if (!existing) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot delete release "${action.releaseId}" because it does not exist.`,
    })
  }

  const state = existing['state']
  if (state && typeof state === 'string' && !DELETABLE_STATES.has(state)) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `Cannot delete release "${action.releaseId}" while it is "${state}". Archive it first.`,
    })
  }

  if (!checkGrant(grants.update, existing, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to delete release "${action.releaseId}".`,
    })
  }

  const mutations: Mutation[] = [{delete: {id: releaseDocumentId}}]

  base = processMutations({documents: base, transactionId, mutations, timestamp})
  working = processMutations({documents: working, transactionId, mutations, timestamp})

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.release.delete',
    releaseId: action.releaseId,
  })

  return {base, working}
}

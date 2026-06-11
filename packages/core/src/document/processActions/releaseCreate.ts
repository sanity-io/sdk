import {type Mutation, type SanityDocument} from '@sanity/types'

import {type CreateReleaseAction} from '../actions'
import {processMutations} from '../processMutations'
import {getReleaseDocumentId} from './releaseUtil'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handleReleaseCreate(
  action: CreateReleaseAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, outgoingActions, outgoingMutations, identity} = ctx
  let {base, working} = ctx

  const releaseDocumentId = getReleaseDocumentId(action.releaseId)

  if (working[releaseDocumentId] || base[releaseDocumentId]) {
    throw new ActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `A release with id "${action.releaseId}" already exists.`,
    })
  }
  // Optimistic local release doc
  const releaseDoc = {
    _id: releaseDocumentId,
    _type: 'system.release',
    name: action.releaseId,
    state: 'active',
    metadata: action.metadata,
  }
  const mutations: Mutation[] = [{create: releaseDoc}]

  base = processMutations({documents: base, transactionId, mutations, timestamp})
  working = processMutations({documents: working, transactionId, mutations, timestamp})

  if (!checkGrant(grants.create, working[releaseDocumentId] as SanityDocument, identity)) {
    throw new PermissionActionError({
      documentId: releaseDocumentId,
      transactionId,
      message: `You do not have permission to create release "${action.releaseId}".`,
    })
  }

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.release.create',
    releaseId: action.releaseId,
    metadata: action.metadata,
  })

  return {base, working}
}

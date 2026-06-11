import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'
import {type Mutation, type Reference, type SanityDocument} from '@sanity/types'

import {isReleasePerspective} from '../../releases/utils/isReleasePerspective'
import {isDeepEqual} from '../../utils/object'
import {type PublishDocumentAction} from '../actions'
import {getId, processMutations} from '../processMutations'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  checkGrant,
  PermissionActionError,
} from './shared'

export function handlePublish(
  action: PublishDocumentAction,
  ctx: ActionHandlerContext,
): ActionHandlerResult {
  const {transactionId, timestamp, grants, identity, outgoingActions, outgoingMutations} = ctx
  let {base, working} = ctx

  const documentId = getId(action.documentId)

  if (action.liveEdit || isReleasePerspective(action.perspective)) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot publish this document. Publishing is not supported for liveEdit or version (release) documents.`,
    })
  }

  // Standard draft/published logic
  const draftId = getDraftId(DocumentId(documentId))
  const publishedId = getPublishedId(DocumentId(documentId))

  const workingDraft = working[draftId]
  const baseDraft = base[draftId]
  if (!workingDraft || !baseDraft) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Cannot publish because no draft version was found for document "${documentId}".`,
    })
  }

  // Before proceeding, verify that the working draft is identical to the base draft.
  // TODO: is it enough just to check for the _rev or nah?
  if (!isDeepEqual(workingDraft, baseDraft)) {
    throw new ActionError({
      documentId,
      transactionId,
      message: `Publish aborted: The document has changed elsewhere. Please try again.`,
    })
  }

  const newPublishedFromDraft = {...strengthenOnPublish(workingDraft), _id: publishedId}

  const mutations: Mutation[] = [{delete: {id: draftId}}, {createOrReplace: newPublishedFromDraft}]

  if (working[draftId] && !checkGrant(grants.update, working[draftId], identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `Publish failed: You do not have permission to update the draft for "${documentId}".`,
    })
  }

  if (working[publishedId] && !checkGrant(grants.update, newPublishedFromDraft, identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `Publish failed: You do not have permission to update the published version of "${documentId}".`,
    })
  } else if (!working[publishedId] && !checkGrant(grants.create, newPublishedFromDraft, identity)) {
    throw new PermissionActionError({
      documentId,
      transactionId,
      message: `Publish failed: You do not have permission to publish a new version of "${documentId}".`,
    })
  }

  base = processMutations({documents: base, transactionId, mutations, timestamp})
  working = processMutations({documents: working, transactionId, mutations, timestamp})

  outgoingMutations.push(...mutations)
  outgoingActions.push({
    actionType: 'sanity.action.document.publish',
    draftId,
    publishedId,
  })
  return {base, working}
}

function strengthenOnPublish(draft: SanityDocument): SanityDocument {
  const isStrengthenReference = (
    value: object,
  ): value is Reference & Required<Pick<Reference, '_strengthenOnPublish'>> =>
    '_strengthenOnPublish' in value

  function strengthen(value: unknown): unknown {
    if (typeof value !== 'object' || !value) return value

    if (isStrengthenReference(value)) {
      const {_strengthenOnPublish, _weak, ...rest} = value
      return {
        ...rest,
        ...(_strengthenOnPublish.weak && {_weak: true}),
      }
    }

    if (Array.isArray(value)) {
      return value.map(strengthen)
    }

    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strengthen(v)]))
  }

  return strengthen(draft) as SanityDocument
}

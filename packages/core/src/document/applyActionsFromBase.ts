import {type Mutation, type PatchMutation} from '@sanity/types'

import {getDraftId, getPublishedId} from '../preview/util'
import {type DocumentAction} from './actions'
import {applyMutations, type DocumentSet} from './applyMutations'
import {createPatchFromDiff} from './createPatchFromDiff'
import {type HttpAction} from './documentStore'

interface ApplyActionsOptions {
  /**
   * The ID of this transaction. This will become the resulting `_rev` for all
   * documents affected by changes derived from the current set of actions.
   */
  transactionId: string

  /**
   * The actions to apply to the given documents
   */
  actions: DocumentAction[]

  /**
   * The set of documents these actions were intended to be applied to. These
   * set of documents should be captured right before a queued action is
   * applied.
   */
  base: DocumentSet

  /**
   * The current "working" set of documents. A patch will be created by applying
   * the actions to the base. This patch will then be applied to the working
   * set for conflict resolution. Initially, this value should match the base
   * set.
   */
  working: DocumentSet

  // // TODO: implement initial values from the schema?
  // initialValues?: {[TDocumentType in string]?: {_type: string}}
}

interface ApplyActionsResult {
  /**
   * The resulting document set after the actions have been applied. This is
   * derived from the working documents.
   */
  working: DocumentSet
  /**
   * The outgoing action that were collected when applying the actions. These
   * are sent to the Actions HTTP API
   */
  outgoingActions: HttpAction[]
  /**
   * The outgoing mutations that were collected when applying the actions. These
   * are here for debugging purposes.
   */
  outgoingMutations: Mutation[]
  /**
   * The previous revisions of the given documents before the actions were applied.
   */
  previousRevs: {[TDocumentId in string]?: string}
}

interface ActionErrorOptions {
  message: string
  documentId: string
  transactionId: string
}

/**
 * Thrown when a precondition for an action failed.
 */
export class ActionError extends Error implements ActionErrorOptions {
  documentId!: string
  transactionId!: string

  constructor(options: ActionErrorOptions) {
    super(options.message)
    Object.assign(this, options)
  }
}

/**
 * Applies the given set of actions to the working set of documents and converts
 * high-level actions into lower-level outgoing mutations/actions that respect
 * the current state of the working documents.
 *
 * Supports a "base" and "working" set of documents to allow actions to be
 * applied on top of a different working set of documents.
 *
 * Actions are applied to the base set of documents first. The difference
 * between the base before and after is used to create a patch. This patch is
 * then applied to the working set of documents and is set as the outgoing patch
 * sent to the server.
 */
export function applyActionsFromBase({
  actions,
  transactionId,
  working: initialWorking,
  base: initialIntended,
}: ApplyActionsOptions): ApplyActionsResult {
  let working = {...initialWorking}
  let base = {...initialIntended}

  const outgoingActions: HttpAction[] = []
  const outgoingMutations: Mutation[] = []

  for (const {documentId, ...action} of actions) {
    const draftId = getDraftId(documentId)
    const publishedId = getPublishedId(documentId)

    switch (action.type) {
      case 'document.create': {
        if (working[draftId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Could not create draft document because a document with ID \`${draftId}\` already exists.`,
          })
        }

        const newDocBase = {...base[publishedId], _type: action.documentType, _id: draftId}
        const newDocWorking = {...working[publishedId], _type: action.documentType, _id: draftId}
        const mutations = [{create: newDocWorking}]

        base = applyMutations({
          documents: base,
          transactionId,
          mutations: [{create: newDocBase}],
        })
        working = applyMutations({
          documents: working,
          transactionId,
          mutations,
        })

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.version.create',
          publishedId,
          attributes: newDocWorking,
        })

        continue
      }
      case 'document.delete': {
        const mutations = [publishedId, draftId].map((id) => ({delete: {id}}))

        base = applyMutations({documents: base, transactionId, mutations})
        working = applyMutations({documents: working, transactionId, mutations})

        const includeDrafts = working[draftId] && [draftId]
        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.delete',
          publishedId,
          // NOTE: this will currently fail if there are versions of this
          // document that belong to a release. this will be fixed when support
          // for releases is added
          ...(includeDrafts && {includeDrafts}),
        })

        continue
      }
      case 'document.discard': {
        const mutations = [{delete: {id: draftId}}]

        base = applyMutations({documents: base, transactionId, mutations})
        working = applyMutations({documents: working, transactionId, mutations})

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.version.discard',
          versionId: draftId,
        })

        continue
      }
      case 'document.edit': {
        if (!working[draftId] && !working[publishedId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Could not edit document with ID \`${publishedId}\` because it does not exist.`,
          })
        }

        const before = base[draftId]
        base = applyMutations({
          documents: base,
          transactionId,
          mutations: [
            ...(!base[draftId] && base[publishedId]
              ? [{createIfNotExists: {...base[publishedId], _id: draftId}}]
              : []),
            {patch: {id: draftId, ...action.patch}},
          ],
        })
        const after = base[draftId]
        const patches = createPatchFromDiff(before, after)

        const mutations = [
          ...(!working[draftId] && working[publishedId]
            ? [{createIfNotExists: {...working[publishedId], _id: draftId}}]
            : []),
          ...patches.map((patch): PatchMutation => ({patch: {id: draftId, ...patch}})),
        ]
        working = applyMutations({
          documents: working,
          transactionId,
          mutations,
        })

        outgoingMutations.push(...mutations)
        outgoingActions.push(
          ...patches.map(
            (patch): Extract<HttpAction, {actionType: 'sanity.action.document.edit'}> => ({
              actionType: 'sanity.action.document.edit',
              draftId,
              publishedId,
              patch,
            }),
          ),
        )

        continue
      }
      case 'document.publish': {
        if (!working[draftId] && !base[draftId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Could not publish document with ID \`${publishedId}\` because a draft document with ID \`${draftId}\` was not found.`,
          })
        }

        const mutations = [
          {delete: {id: draftId}},
          {createOrReplace: {...(working[draftId] ?? base[draftId])!, _id: publishedId}},
        ]
        base = applyMutations({
          documents: base,
          transactionId,
          mutations: [
            {delete: {id: draftId}},
            {createOrReplace: {...(base[draftId] ?? working[draftId])!, _id: publishedId}},
          ],
        })
        working = applyMutations({
          documents: working,
          transactionId,
          mutations,
        })
        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.publish',
          draftId,
          publishedId,
          // // TODO:
          // ...(draftRevision && {ifDraftRevisionId: draftRevision}),
          // ...(publishedRevision && {ifPublishedRevisionId: publishedRevision}),
        })

        continue
      }

      case 'document.unpublish': {
        if (!working[publishedId] && !base[publishedId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Could not unpublished document with ID \`${publishedId}\` because the published document was not found.`,
          })
        }

        const mutations = [
          {delete: {id: publishedId}},
          {createIfNotExists: {...(working[publishedId] ?? base[publishedId])!, _id: draftId}},
        ]
        base = applyMutations({
          documents: base,
          transactionId,
          mutations: [
            {delete: {id: publishedId}},
            {createIfNotExists: {...(base[publishedId] ?? working[publishedId])!, _id: draftId}},
          ],
        })
        working = applyMutations({documents: working, transactionId, mutations})

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.unpublish',
          draftId,
          publishedId,
        })

        continue
      }
    }
  }

  return {
    working,
    outgoingActions,
    outgoingMutations,
    previousRevs: Object.fromEntries(
      Object.entries(initialWorking).map(([id, doc]) => [id, doc?._rev]),
    ),
  }
}

import {
  type Mutation,
  type PatchOperations,
  type Reference,
  type SanityDocument,
} from '@sanity/types'
import {type ExprNode} from 'groq-js'
import {isEqual} from 'lodash-es'

import {getDraftId, getPublishedId} from '../utils/ids'
import {evaluateSync} from './_synchronous-groq-js.mjs'
import {type DocumentAction} from './actions'
import {diffPatch} from './diffPatch'
import {type Grant} from './permissions'
import {type DocumentSet, getId, processMutations} from './processMutations'
import {type HttpAction} from './reducers'

function checkGrant(grantExpr: ExprNode, document: SanityDocument): boolean {
  return evaluateSync(grantExpr, {params: {document}}).get()
}

interface ProcessActionsOptions {
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

  /**
   * The timestamp to use for `_updateAt` and other similar timestamps for this
   * transaction
   */
  timestamp: string

  /**
   * the lookup with pre-parsed GROQ expressions
   */
  grants: Record<Grant, ExprNode>

  // // TODO: implement initial values from the schema?
  // initialValues?: {[TDocumentType in string]?: {_type: string}}
}

interface ProcessActionsResult {
  /**
   * The resulting document set after the actions have been applied. This is
   * derived from the working documents.
   */
  working: DocumentSet
  /**
   * The document set before the actions have been applied. This is simply the
   * input of the `working` document set.
   */
  previous: DocumentSet
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

export class PermissionActionError extends ActionError {}

/**
 * Applies the given set of actions to the working set of documents and converts
 * high-level actions into lower-level outgoing mutations/actions that respect
 * the current state of the working documents.
 *
 * Supports a "base" and "working" set of documents to allow actions to be
 * applied on top of a different working set of documents in a 3-way merge
 *
 * Actions are applied to the base set of documents first. The difference
 * between the base before and after is used to create a patch. This patch is
 * then applied to the working set of documents and is set as the outgoing patch
 * sent to the server.
 */
export function processActions({
  actions,
  transactionId,
  working: initialWorking,
  base: initialBase,
  timestamp,
  grants,
}: ProcessActionsOptions): ProcessActionsResult {
  let working: DocumentSet = {...initialWorking}
  let base: DocumentSet = {...initialBase}

  const outgoingActions: HttpAction[] = []
  const outgoingMutations: Mutation[] = []

  for (const action of actions) {
    switch (action.type) {
      case 'document.create': {
        const documentId = getId(action.documentId)
        const draftId = getDraftId(documentId)
        const publishedId = getPublishedId(documentId)

        if (working[draftId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `A draft version of this document already exists. Please use or discard the existing draft before creating a new one.`,
          })
        }

        // Spread the (possibly undefined) published version directly.
        const newDocBase = {...base[publishedId], _type: action.documentType, _id: draftId}
        const newDocWorking = {...working[publishedId], _type: action.documentType, _id: draftId}
        const mutations: Mutation[] = [{create: newDocWorking}]

        base = processMutations({
          documents: base,
          transactionId,
          mutations: [{create: newDocBase}],
          timestamp,
        })
        working = processMutations({
          documents: working,
          transactionId,
          mutations,
          timestamp,
        })

        if (!checkGrant(grants.create, working[draftId] as SanityDocument)) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `You do not have permission to create a draft for document "${documentId}".`,
          })
        }

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.version.create',
          publishedId,
          attributes: newDocWorking,
        })
        continue
      }

      case 'document.delete': {
        const documentId = action.documentId
        const draftId = getDraftId(documentId)
        const publishedId = getPublishedId(documentId)

        if (!working[publishedId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: working[draftId]
              ? 'Cannot delete a document without a published version.'
              : 'The document you are trying to delete does not exist.',
          })
        }

        const cantDeleteDraft = working[draftId] && !checkGrant(grants.update, working[draftId])
        const cantDeletePublished =
          working[publishedId] && !checkGrant(grants.update, working[publishedId])

        if (cantDeleteDraft || cantDeletePublished) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `You do not have permission to delete this document.`,
          })
        }

        const mutations: Mutation[] = [{delete: {id: publishedId}}, {delete: {id: draftId}}]
        const includeDrafts = working[draftId] ? [draftId] : undefined

        base = processMutations({documents: base, transactionId, mutations, timestamp})
        working = processMutations({documents: working, transactionId, mutations, timestamp})

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.delete',
          publishedId,
          ...(includeDrafts ? {includeDrafts} : {}),
        })
        continue
      }

      case 'document.discard': {
        const documentId = getId(action.documentId)
        const draftId = getDraftId(documentId)
        const mutations: Mutation[] = [{delete: {id: draftId}}]

        if (!working[draftId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `There is no draft available to discard for document "${documentId}".`,
          })
        }

        if (!checkGrant(grants.update, working[draftId])) {
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
          versionId: draftId,
        })
        continue
      }

      case 'document.edit': {
        const documentId = getId(action.documentId)
        const draftId = getDraftId(documentId)
        const publishedId = getPublishedId(documentId)
        const userPatches = action.patches?.map((patch) => ({patch: {id: draftId, ...patch}}))

        // skip this action if there are no associated patches
        if (!userPatches?.length) continue

        if (
          (!working[draftId] && !working[publishedId]) ||
          (!base[draftId] && !base[publishedId])
        ) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Cannot edit document because it does not exist in draft or published form.`,
          })
        }

        const baseMutations: Mutation[] = []
        if (!base[draftId] && base[publishedId]) {
          baseMutations.push({create: {...base[publishedId], _id: draftId}})
        }

        // the first if statement should make this never be null or undefined
        const baseBefore = (base[draftId] ?? base[publishedId]) as SanityDocument
        if (userPatches) {
          baseMutations.push(...userPatches)
        }

        base = processMutations({
          documents: base,
          transactionId,
          mutations: baseMutations,
          timestamp,
        })
        // this one will always be defined because a patch mutation will never
        // delete an input document
        const baseAfter = base[draftId] as SanityDocument

        // TODO: consider replacing with `sanity-diff-patch`. There seems to be
        // bug in `sanity-diff-patch` where differing strings are not creating
        // diff-match patches.
        const patches = diffPatch(baseBefore, baseAfter)

        const workingMutations: Mutation[] = []
        if (!working[draftId] && working[publishedId]) {
          const newDraftFromPublished = {...working[publishedId], _id: draftId}

          if (!checkGrant(grants.create, newDraftFromPublished)) {
            throw new PermissionActionError({
              documentId,
              transactionId,
              message: `You do not have permission to create a draft for editing this document.`,
            })
          }

          workingMutations.push({create: newDraftFromPublished})
        }

        // the first if statement should make this never be null or undefined
        const workingBefore = (working[draftId] ?? working[publishedId]) as SanityDocument
        if (!checkGrant(grants.update, workingBefore)) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `You do not have permission to edit document "${documentId}".`,
          })
        }
        workingMutations.push(...patches.map((patch) => ({patch: {id: draftId, ...patch}})))

        working = processMutations({
          documents: working,
          transactionId,
          mutations: workingMutations,
          timestamp,
        })

        outgoingMutations.push(...workingMutations)
        outgoingActions.push(
          ...patches.map(
            (patch): HttpAction => ({
              actionType: 'sanity.action.document.edit',
              draftId,
              publishedId,
              patch: patch as PatchOperations,
            }),
          ),
        )

        continue
      }

      case 'document.publish': {
        const documentId = getId(action.documentId)
        const draftId = getDraftId(documentId)
        const publishedId = getPublishedId(documentId)

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
        if (!isEqual(workingDraft, baseDraft)) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Publish aborted: The document has changed elsewhere. Please try again.`,
          })
        }

        const newPublishedFromDraft = {...strengthenOnPublish(workingDraft), _id: publishedId}

        const mutations: Mutation[] = [
          {delete: {id: draftId}},
          {createOrReplace: newPublishedFromDraft},
        ]

        if (working[draftId] && !checkGrant(grants.update, working[draftId])) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `Publish failed: You do not have permission to update the draft for "${documentId}".`,
          })
        }

        if (working[publishedId] && !checkGrant(grants.update, newPublishedFromDraft)) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `Publish failed: You do not have permission to update the published version of "${documentId}".`,
          })
        } else if (!working[publishedId] && !checkGrant(grants.create, newPublishedFromDraft)) {
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
        continue
      }

      case 'document.unpublish': {
        const documentId = getId(action.documentId)
        const draftId = getDraftId(documentId)
        const publishedId = getPublishedId(documentId)

        if (!working[publishedId] && !base[publishedId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Cannot unpublish because the document "${documentId}" is not currently published.`,
          })
        }

        const sourceDoc = working[publishedId] ?? (base[publishedId] as SanityDocument)
        const newDraftFromPublished = {...sourceDoc, _id: draftId}
        const mutations: Mutation[] = [
          {delete: {id: publishedId}},
          {createIfNotExists: newDraftFromPublished},
        ]

        if (!checkGrant(grants.update, sourceDoc)) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `You do not have permission to unpublish the document "${documentId}".`,
          })
        }

        if (!working[draftId] && !checkGrant(grants.create, newDraftFromPublished)) {
          throw new PermissionActionError({
            documentId,
            transactionId,
            message: `You do not have permission to create a draft from the published version of "${documentId}".`,
          })
        }

        base = processMutations({
          documents: base,
          transactionId,
          mutations: [
            {delete: {id: publishedId}},
            {createIfNotExists: {...(base[publishedId] ?? sourceDoc), _id: draftId}},
          ],
          timestamp,
        })
        working = processMutations({documents: working, transactionId, mutations, timestamp})

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.unpublish',
          draftId,
          publishedId,
        })
        continue
      }

      default: {
        throw new Error(
          `Unknown action type: "${
            // @ts-expect-error invalid input
            action.type
          }". Please contact support if this issue persists.`,
        )
      }
    }
  }

  const previousRevs = Object.fromEntries(
    Object.entries(initialWorking).map(([id, doc]) => [id, doc?._rev]),
  )

  return {
    working,
    outgoingActions,
    outgoingMutations,
    previous: initialWorking,
    previousRevs,
  }
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

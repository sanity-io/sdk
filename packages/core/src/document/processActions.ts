import {type Mutation, type PatchOperations, type SanityDocument} from '@sanity/types'
import {isEqual} from 'lodash-es'

import {getDraftId, getPublishedId} from '../utils/ids'
import {type DocumentAction} from './actions'
import {diffPatch} from './diffPatch'
import {type DocumentSet, processMutations} from './processMutations'
import {type HttpAction} from './reducers'

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

  timestamp: string

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
}: ProcessActionsOptions): ProcessActionsResult {
  let working: DocumentSet = {...initialWorking}
  let base: DocumentSet = {...initialBase}

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
            message: `Cannot create draft document: document with ID "${draftId}" already exists.`,
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

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.version.create',
          publishedId,
          attributes: newDocWorking,
        })
        break
      }

      case 'document.delete': {
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
        break
      }

      case 'document.discard': {
        const mutations: Mutation[] = [{delete: {id: draftId}}]

        base = processMutations({documents: base, transactionId, mutations, timestamp})
        working = processMutations({documents: working, transactionId, mutations, timestamp})

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.version.discard',
          versionId: draftId,
        })
        break
      }

      case 'document.edit': {
        if (
          (!working[draftId] && !working[publishedId]) ||
          (!base[draftId] && !base[publishedId])
        ) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Cannot edit document: neither draft "${draftId}" nor published "${publishedId}" exists.`,
          })
        }

        const baseMutations: Mutation[] = []
        if (!base[draftId] && base[publishedId]) {
          baseMutations.push({
            createIfNotExists: {...base[publishedId], _id: draftId},
          })
        }

        // the above if statement should make this never be null or undefined
        const baseBefore = (base[draftId] ?? base[publishedId]) as SanityDocument
        baseMutations.push(...action.patches.map((patch) => ({patch: {id: draftId, ...patch}})))

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
          workingMutations.push({
            createIfNotExists: {...working[publishedId], _id: draftId},
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

        break
      }

      case 'document.publish': {
        const workingDraft = working[draftId]
        const baseDraft = base[draftId]
        if (!workingDraft || !baseDraft) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Cannot publish: draft document "${draftId}" not found.`,
          })
        }

        // Before proceeding, verify that the working draft is identical to the base draft.
        // TODO: is it enough just to check for the _rev or nah?
        if (!isEqual(workingDraft, baseDraft)) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Publish aborted: detected remote changes since published was scheduled. Please try again.`,
          })
        }

        const mutations: Mutation[] = [
          {delete: {id: draftId}},
          {createOrReplace: {...baseDraft, _id: publishedId}},
        ]

        base = processMutations({documents: base, transactionId, mutations, timestamp})
        working = processMutations({documents: working, transactionId, mutations, timestamp})

        outgoingMutations.push(...mutations)
        outgoingActions.push({
          actionType: 'sanity.action.document.publish',
          draftId,
          publishedId,
        })
        break
      }

      case 'document.unpublish': {
        if (!working[publishedId] && !base[publishedId]) {
          throw new ActionError({
            documentId,
            transactionId,
            message: `Cannot unpublish: published document "${publishedId}" not found.`,
          })
        }

        const sourceDoc = working[publishedId] ?? (base[publishedId] as SanityDocument)
        const mutations: Mutation[] = [
          {delete: {id: publishedId}},
          {createIfNotExists: {...sourceDoc, _id: draftId}},
        ]

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
        break
      }

      default: {
        throw new Error(
          `Unknown action type: ${
            // @ts-expect-error invalid input
            action.type
          }`,
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

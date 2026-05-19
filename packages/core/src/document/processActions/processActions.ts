import {type Mutation} from '@sanity/types'
import {type ExprNode} from 'groq-js'

import {type Action, type DocumentAction} from '../actions'
import {type Grant} from '../permissions'
import {type DocumentSet} from '../processMutations'
import {type HttpAction} from '../reducers'
import {handleCreate} from './create'
import {handleDelete} from './delete'
import {handleDiscard} from './discard'
import {handleEdit} from './edit'
import {handlePublish} from './publish'
import {handleReleaseArchive, handleReleaseUnarchive} from './releaseArchive'
import {handleReleaseCreate} from './releaseCreate'
import {handleReleaseDelete} from './releaseDelete'
import {handleReleaseEdit} from './releaseEdit'
import {handleReleasePublish} from './releasePublish'
import {handleReleaseSchedule, handleReleaseUnschedule} from './releaseSchedule'
import {isReleaseAction} from './releaseUtil'
import {
  ActionError,
  type ActionHandlerContext,
  type ActionHandlerResult,
  PermissionActionError,
} from './shared'
import {handleUnpublish} from './unpublish'

export {ActionError, PermissionActionError}

interface ProcessActionsOptions {
  /**
   * The ID of this transaction. This will become the resulting `_rev` for all
   * documents affected by changes derived from the current set of actions.
   */
  transactionId: string

  /**
   * The actions to apply to the given documents
   */
  actions: Action[]

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

  /**
   * The current user's ID, passed to GROQ as the value of `identity()` when
   * evaluating ACL filters. Optional because the user may not have loaded yet;
   * filters that reference `identity()` will evaluate to null in that case.
   */
  identity?: string

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
  identity,
}: ProcessActionsOptions): ProcessActionsResult {
  let base: DocumentSet = {...initialBase}
  let working: DocumentSet = {...initialWorking}

  const outgoingActions: HttpAction[] = []
  const outgoingMutations: Mutation[] = []

  // liveEdit document actions go to the mutations API, since the actions API
  // requires a draft+published pair. Mixing them with anything else in the same
  // transaction would silently lose atomicity for the non-liveEdit operations,
  // so require users to split the transaction.
  // (Note that the reducers already does this for us -- you'd have to try hard to mix them.)
  const liveEditAction = actions.find((action) => !isReleaseAction(action) && action.liveEdit) as
    | DocumentAction
    | undefined
  const otherAction = actions.find((action) => isReleaseAction(action) || !action.liveEdit)
  if (liveEditAction && otherAction) {
    throw new ActionError({
      documentId: liveEditAction.documentId!,
      transactionId,
      message:
        'Cannot combine liveEdit document actions with other actions in the same transaction. Submit them as separate transactions.',
    })
  }

  for (const action of actions) {
    const result = dispatch(action, {
      base,
      working,
      transactionId,
      timestamp,
      grants,
      identity,
      outgoingActions,
      outgoingMutations,
    })
    base = result.base
    working = result.working
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

function dispatch(action: Action, ctx: ActionHandlerContext): ActionHandlerResult {
  switch (action.type) {
    case 'document.create':
      return handleCreate(action, ctx)
    case 'document.delete':
      return handleDelete(action, ctx)
    case 'document.discard':
      return handleDiscard(action, ctx)
    case 'document.edit':
      return handleEdit(action, ctx)
    case 'document.publish':
      return handlePublish(action, ctx)
    case 'document.unpublish':
      return handleUnpublish(action, ctx)
    case 'release.create':
      return handleReleaseCreate(action, ctx)
    case 'release.edit':
      return handleReleaseEdit(action, ctx)
    case 'release.publish':
      return handleReleasePublish(action, ctx)
    case 'release.schedule':
      return handleReleaseSchedule(action, ctx)
    case 'release.unschedule':
      return handleReleaseUnschedule(action, ctx)
    case 'release.archive':
      return handleReleaseArchive(action, ctx)
    case 'release.unarchive':
      return handleReleaseUnarchive(action, ctx)
    case 'release.delete':
      return handleReleaseDelete(action, ctx)
    default:
      throw new Error(
        `Unknown action type: "${
          // @ts-expect-error invalid input
          action.type
        }". Please contact support if this issue persists.`,
      )
  }
}

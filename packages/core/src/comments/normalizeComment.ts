import {toCommentMessage} from './commentMessage'
import {type Comment, type StoredComment} from './types'

/**
 * The published document id inside a global document reference.
 *
 * A reference reads `resourceType:resourceId:documentId`, and the resource id
 * of a dataset carries a dot (`projectId.dataset`) while a document id can
 * carry colons in neither part, so splitting on the first two colons is exact.
 */
function toDocumentId(ref: string): string {
  const separator = ref.indexOf(':', ref.indexOf(':') + 1)
  return separator === -1 ? ref : ref.slice(separator + 1)
}

/**
 * Turns a stored comment into the shape consumers see.
 *
 * This is the whole seam between the storage format and the public API: the
 * global document reference is unwrapped into a plain published id, the author
 * comes off `_system`, reactions lose the array keys that only exist to address
 * them, and `_type` stops being exposed at all.
 *
 * @internal
 */
export function normalizeComment(stored: StoredComment): Comment {
  const {target} = stored
  const authorId = stored._system?.createdBy

  return {
    id: stored._id,
    createdAt: stored._createdAt,
    // Omitted rather than emptied when absent, so a consumer can tell "no
    // author recorded" from a user whose id happens to be falsy.
    ...(authorId ? {authorId} : {}),
    message: toCommentMessage(stored.message),
    // A comment always belongs to a thread, but the id is the API's to assign,
    // so fall back to the one a thread would take from its first comment.
    threadId: stored.threadId ?? stored.parentCommentId ?? stored._id,
    ...(stored.parentCommentId ? {parentCommentId: stored.parentCommentId} : {}),
    status: stored.status,
    ...(stored.lastEditedAt ? {lastEditedAt: stored.lastEditedAt} : {}),
    documentId: toDocumentId(target.document._ref),
    sourceDocumentId: target.sourceDocumentId,
    documentType: target.documentType,
    fieldPath: target.path?.field ?? '',
    ...(target.path?.selection ? {selection: target.path.selection} : {}),
    ...(stored.contentSnapshot === undefined
      ? {}
      : {contentSnapshot: toCommentMessage(stored.contentSnapshot)}),
    // Dropped: the stored `_key`, which only exists to address the array item.
    reactions: stored.reactions.map(({shortName, userId, addedAt}) => ({
      shortName,
      userId,
      addedAt,
    })),
    ...(stored._state ? {state: stored._state} : {}),
  }
}

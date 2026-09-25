import {type Comment, type StoredComment} from './types'

/**
 * Turns a stored comment into the shape consumers see.
 *
 * This is the whole seam between the storage format and the public API. When
 * comments move to the organization-level store, the three fields that differ
 * are handled here and nothing downstream changes:
 *
 * - the author moves from `authorId` to `_system.createdBy`
 * - `target.document` becomes a global document reference, so `documentId` is
 *   parsed out of a `resourceType:resourceId:documentId` string rather than
 *   read off `_ref`
 * - `_type` goes from `comment` to `sanity.comment`, and stops being exposed
 *
 * @internal
 */
export function normalizeComment(stored: StoredComment): Comment {
  const {target} = stored

  return {
    id: stored._id,
    createdAt: stored._createdAt,
    // Omitted rather than emptied when absent, so a consumer can tell "no
    // author recorded" from a user whose id happens to be falsy.
    ...(stored.authorId ? {authorId: stored.authorId} : {}),
    message: stored.message,
    threadId: stored.threadId,
    ...(stored.parentCommentId ? {parentCommentId: stored.parentCommentId} : {}),
    status: stored.status,
    ...(stored.lastEditedAt ? {lastEditedAt: stored.lastEditedAt} : {}),
    documentId: target.document._ref,
    documentType: target.documentType,
    fieldPath: target.path?.field ?? '',
    ...(target.path?.selection ? {selection: target.path.selection} : {}),
    ...(stored.contentSnapshot === undefined ? {} : {contentSnapshot: stored.contentSnapshot}),
    // Dropped: the stored `_key`, which only exists to address the array item.
    reactions: (stored.reactions ?? []).map(({shortName, userId, addedAt}) => ({
      shortName,
      userId,
      addedAt,
    })),
    ...(stored._state ? {state: stored._state} : {}),
  }
}

import {type StoredComment} from './types'

/**
 * Comment documents as the API returns them, for the tests around this module.
 *
 * Shared rather than rebuilt per file so that a change to the stored shape —
 * which is the API's to make, not ours — lands in one place.
 *
 * @internal
 */
export const ORGANIZATION_ID = 'org-1'

/** The global document reference for `doc-1` in the `p.d` dataset resource. */
export const TARGET_REF = 'dataset:p.d:doc-1'

/** @internal */
export function commentTarget(
  overrides: Partial<StoredComment['target']> = {},
): StoredComment['target'] {
  return {
    document: {_ref: TARGET_REF, _type: 'globalDocumentReference', _weak: true},
    documentType: 'author',
    sourceDocumentId: 'doc-1',
    ...overrides,
  }
}

/** @internal */
export function storedComment(
  overrides: Partial<StoredComment> & Pick<StoredComment, '_id'>,
): StoredComment {
  return {
    _type: 'sanity.comment',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    _rev: 'rev',
    _system: {createdBy: 'user-1'},
    message: [{_type: 'block', children: [{_type: 'span', text: 'hello'}]}],
    threadId: 'thread-1',
    status: 'open',
    reactions: [],
    target: commentTarget(),
    ...overrides,
  }
}

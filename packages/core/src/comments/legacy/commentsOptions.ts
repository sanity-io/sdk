// fallow-ignore-file code-duplication -- deprecated add-on dataset comments, kept alongside comments/ until removal in the next major
import {type Path} from '@sanity/types'

import {type DocumentHandle} from '../../config/sanityConfig'
import {toCommentFieldPath} from '../commentFieldPath'
import {type CommentStatus} from './types'

/**
 * Which comments to read.
 * @beta
 * @deprecated Comments have moved to the organization collaboration API. Import from
 * `@sanity/sdk/collaboration`; this add-on dataset API is removed in the next major.
 */
export interface CommentsOptions extends DocumentHandle {
  /**
   * Narrow to one field. Omit to get every comment on the document.
   */
  fieldPath?: string | Path
  /** Narrow to open or resolved threads. Omit for both. */
  status?: CommentStatus
}

/**
 * @beta
 * @deprecated Comments have moved to the organization collaboration API. Import from
 * `@sanity/sdk/collaboration`; this add-on dataset API is removed in the next major.
 */
export interface ResolveCommentsOptions extends CommentsOptions {
  signal?: AbortSignal
}

/**
 * Fields on {@link CommentsOptions} that are deliberately left out of the key
 * below, because neither changes which comments an option set addresses.
 *
 * `source` is the deprecated alias for `resource` and is folded into it before
 * a key is ever built, so keying on both would give one list two keys.
 * `liveEdit` describes the document rather than its comments, which hang off
 * the published id whether or not drafts exist.
 */
type CommentsKeyIrrelevantField = 'source' | 'liveEdit'

/**
 * A stable string standing for one set of read options.
 *
 * Only React needs this: it holds one state source steady across renders and
 * defers swapping to a new one while the previous list is still on screen.
 * `fieldPath` is normalised on the way in, so a path array and the equivalent
 * string address the same list.
 *
 * Kept apart from the store it keys, because React imports this to memoize and
 * pulling the store in with it would put both comment stores into every bundle
 * that reads a comment.
 *
 * @internal
 */
export function getCommentsOptionsKey(options: CommentsOptions): string {
  return JSON.stringify({
    documentId: options.documentId,
    documentType: options.documentType,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    perspective: options.perspective,
    fieldPath: options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath),
    status: options.status,
    // The `Record` half makes a new field on `CommentsOptions` a compile
    // error here unless it is listed above or named as irrelevant. Left to
    // `satisfies CommentsOptions` alone, a forgotten field would just be
    // absent from the key, and a reader would keep the list it had while the
    // caller thought it had asked for a different one.
  } satisfies CommentsOptions &
    Record<Exclude<keyof CommentsOptions, CommentsKeyIrrelevantField>, unknown>)
}

/** @internal */
export function parseCommentsOptionsKey(key: string): CommentsOptions {
  return JSON.parse(key) as CommentsOptions
}

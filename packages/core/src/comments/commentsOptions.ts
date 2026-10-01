import {type QueryParams} from '@sanity/client'
import {type Path} from '@sanity/types'

import {type DatasetHandle, type DocumentHandle} from '../config/sanityConfig'
import {toCommentFieldPath} from './commentFieldPath'
import {type CommentStatus} from './types'

/**
 * Which variants of a document to read comments from.
 *
 * @beta
 */
export type CommentVariants = 'perspective' | 'drafts' | 'exact' | 'all'

/**
 * Which of a document's comments to read.
 * @beta
 */
export interface CommentsOptions extends DocumentHandle {
  /** Narrow to one field. Omit to get every comment on the document. */
  fieldPath?: string | Path
  /** Narrow to open or resolved threads. Omit for both. */
  status?: CommentStatus
  /**
   * Which variants of the document to read comments from.
   *
   * - `'perspective'` follows what you are viewing: a release shows that
   *   release's comments, anything else pools draft and published.
   * - `'drafts'` pools draft and published and ignores releases.
   * - `'exact'` matches only the precise document id passed.
   * - `'all'` returns every comment on the document.
   *
   * `'perspective'` recognises a release from the `{releaseName}` form. A
   * stacked `ClientPerspective` array names several layers at once, with no
   * single release to read comments from, so it pools draft and published as
   * any other non-release perspective does. Pass a version id as the
   * `documentId`, or `variants: 'exact'`, to name a release yourself.
   *
   * @defaultValue 'perspective'
   */
  variants?: CommentVariants
}

/** @beta */
export interface ResolveCommentsOptions extends CommentsOptions {
  signal?: AbortSignal
}

/**
 * An arbitrary comment query, for anything that is not "comments on this
 * document" — cross-document views, per-user views, organization-wide activity.
 *
 * @beta
 */
export interface CommentsQueryOptions extends DatasetHandle {
  /**
   * GROQ filter applied to comment documents. `_type == "sanity.comment"` is
   * added for you, so this only has to say which comments.
   */
  filter: string
  params?: QueryParams
}

/** @beta */
export interface ResolveCommentsQueryOptions extends CommentsQueryOptions {
  signal?: AbortSignal
}

/**
 * Fields on the read option types that are deliberately left out of the keys
 * below, because none of them changes which comments an option set addresses.
 *
 * `source` is the deprecated alias for `resource` and is folded into it before
 * a key is ever built, so keying on both would give one list two keys.
 * `liveEdit` describes the document rather than its comments, which hang off
 * the published id whether or not drafts exist.
 */
type CommentsKeyIrrelevantField = 'source' | 'liveEdit'

/**
 * A stable string standing for one set of document read options.
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
export function getDocumentCommentsOptionsKey(options: CommentsOptions): string {
  return JSON.stringify({
    documentId: options.documentId,
    documentType: options.documentType,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    perspective: options.perspective,
    fieldPath: options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath),
    status: options.status,
    variants: options.variants,
    // The `Record` half makes a new field on `CommentsOptions` a compile
    // error here unless it is listed above or named as irrelevant. Left to
    // `satisfies CommentsOptions` alone, a forgotten field would just be
    // absent from the key, and a reader would keep the list it had while the
    // caller thought it had asked for a different one.
  } satisfies CommentsOptions &
    Record<Exclude<keyof CommentsOptions, CommentsKeyIrrelevantField>, unknown>)
}

/** @internal */
export function parseDocumentCommentsOptionsKey(key: string): CommentsOptions {
  return JSON.parse(key) as CommentsOptions
}

/**
 * The same, for the GROQ escape hatch.
 *
 * @internal
 */
export function getCommentsQueryOptionsKey(options: CommentsQueryOptions): string {
  return JSON.stringify({
    filter: options.filter,
    params: options.params,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    perspective: options.perspective,
  } satisfies CommentsQueryOptions &
    Record<Exclude<keyof CommentsQueryOptions, CommentsKeyIrrelevantField>, unknown>)
}

/** @internal */
export function parseCommentsQueryOptionsKey(key: string): CommentsQueryOptions {
  return JSON.parse(key) as CommentsQueryOptions
}

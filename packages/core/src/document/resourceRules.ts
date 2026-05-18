import {DocumentId, getPublishedId} from '@sanity/id-utils'

import {
  type DocumentResource,
  isCanvasResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type DocumentAction} from './actions'
import {getEffectiveDocumentId} from './util'

export interface EffectiveDocModel {
  /**
   * When `true`, the resource forces the document type to liveEdit mode.
   * When `false`, the resource forces draft/published behavior.
   * When `undefined`, the resource has no opinion and the handle's `liveEdit`
   * flag should be respected.
   */
  liveEdit: boolean | undefined
  /**
   * When `false`, the resource does not support release perspectives. Callers
   * should drop any release perspective and fall back to the standard path.
   */
  supportsReleases: boolean
}

const MEDIA_LIBRARY_DRAFTED_TYPES = new Set(['sanity.asset'])

/**
 * Returns the effective document model for a given resource and document type.
 *
 * Canvas has no draft/published model — every document is liveEdit. Media
 * Library is mostly liveEdit except for `sanity.asset`, which retains the
 * draft/published model. Neither resource supports release perspectives.
 *
 * @internal
 */
export function getEffectiveDocModel(
  resource: DocumentResource | undefined,
  documentType: string | undefined,
): EffectiveDocModel {
  if (!resource) {
    return {liveEdit: undefined, supportsReleases: true}
  }
  if (isCanvasResource(resource)) {
    return {liveEdit: true, supportsReleases: false}
  }
  if (isMediaLibraryResource(resource)) {
    const isDrafted = documentType ? MEDIA_LIBRARY_DRAFTED_TYPES.has(documentType) : false
    return {liveEdit: !isDrafted, supportsReleases: false}
  }
  return {liveEdit: undefined, supportsReleases: true}
}

function describeResource(resource: DocumentResource | undefined): string {
  if (resource && isCanvasResource(resource)) return 'Canvas'
  if (resource && isMediaLibraryResource(resource)) return 'Media Library'
  return 'this resource'
}

/**
 * Rewrites edit actions to match the editing model of the bound resource.
 *
 * Canvas and Media Library resources do not support release perspectives, and
 * Canvas (plus most Media Library types) does not have a draft/published
 * model. When an edit action arrives with a release perspective for a resource
 * that doesn't support it, the perspective is stripped and a single warning
 * is logged. When the resource forces liveEdit, the action's `liveEdit` flag
 * is set so the dispatcher takes the liveEdit branch.
 *
 * Only `document.edit` actions are normalized today — other action types
 * (publish, unpublish, etc.) pass through unchanged.
 *
 * @internal
 */
export function normalizeActionsForResource(
  actions: DocumentAction[],
  resource: DocumentResource | undefined,
): DocumentAction[] {
  const stripped: Array<{documentType: string; documentId: string}> = []

  const normalized = actions.map((action) => {
    if (action.type !== 'document.edit') return action

    const {liveEdit: forcedLiveEdit, supportsReleases} = getEffectiveDocModel(
      resource,
      action.documentType,
    )
    const stripRelease = isReleasePerspective(action.perspective) && !supportsReleases
    const overrideLiveEdit = forcedLiveEdit === true && !action.liveEdit

    if (!stripRelease && !overrideLiveEdit) return action

    const corrected: DocumentAction = {...action}
    if (overrideLiveEdit) corrected.liveEdit = true
    if (stripRelease) corrected.perspective = undefined

    // Re-derive the document ID from the published root so a previously
    // computed draft/version ID is converted back to the form appropriate for
    // the corrected liveEdit/perspective.
    const publishedRoot = getPublishedId(DocumentId(action.documentId))
    corrected.documentId = getEffectiveDocumentId({
      ...corrected,
      documentId: publishedRoot,
    })

    if (stripRelease) {
      stripped.push({documentType: action.documentType, documentId: corrected.documentId})
    }

    return corrected
  })

  if (stripped.length > 0) {
    const docs = stripped.map((e) => `${e.documentType} (${e.documentId})`).join(', ')
    // eslint-disable-next-line no-console
    console.warn(
      `[sanity-sdk] ${describeResource(resource)} does not support release perspectives — falling back to the standard editing path for: ${docs}`,
    )
  }

  return normalized
}

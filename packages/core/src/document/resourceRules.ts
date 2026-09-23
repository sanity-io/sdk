import {DocumentId, getPublishedId} from '@sanity/id-utils'

import {
  type DocumentResource,
  isCanvasResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {type Action, type EditDocumentAction} from './actions'
import {getEffectiveDocumentId} from './util'

export interface EffectiveDocModel {
  /**
   * If this is `undefined`, the resource has no opinion and the handle's `liveEdit`
   * flag should be respected.
   */
  liveEdit: boolean | undefined
  /**
   * When `false`, the resource does not support release perspectives or
   * variants. Callers should drop both and fall back to the standard path.
   */
  supportsReleases: boolean
}

const MEDIA_LIBRARY_DRAFTED_TYPES = new Set(['sanity.asset'])

/**
 * Different resources have different "default" editing models.
 *
 * Canvas uses a liveEdit model.
 * Medial Library is mostly liveEdit except for `sanity.asset`, which retains the
 * draft/published model. Neither resource supports release perspectives.
 */
export function getEffectiveDocumentModel(
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
 * Canvas and Media Library resources do not support release perspectives or
 * variants, and Canvas (plus most Media Library types) does not have a
 * draft/published model. When an edit action arrives with a release
 * perspective or variant for a resource that doesn't support it, that field is
 * stripped and a single warning is logged. When the resource forces liveEdit,
 * the action's `liveEdit` flag is set so the dispatcher takes the liveEdit
 * branch.
 *
 * Only `document.edit` actions are normalized today — other action types
 * (publish, unpublish, release actions, etc.) pass through unchanged.
 *
 * @internal
 */
export function normalizeActionsForResource(
  actions: Action[],
  resource: DocumentResource | undefined,
): Action[] {
  // collect actions that may have changed in unexpected ways
  const stripped: Array<{documentType: string; documentId: string}> = []

  const normalized = actions.map((action) => {
    if (action.type !== 'document.edit') return action
    const {corrected, strippedVersioning} = normalizeEditAction(action, resource)
    if (strippedVersioning) {
      stripped.push({documentType: action.documentType, documentId: corrected.documentId})
    }
    return corrected
  })

  if (stripped.length > 0) {
    const docs = stripped.map((e) => `${e.documentType} (${e.documentId})`).join(', ')
    // eslint-disable-next-line no-console
    console.warn(
      `[sanity-sdk] ${describeResource(resource)} does not support release perspectives or variants — falling back to the standard editing path for: ${docs}`,
    )
  }

  return normalized
}

/**
 * Applies the resource's editing model to a single edit action. Reports whether
 * a release perspective or variant was stripped so the caller can warn once.
 */
function normalizeEditAction(
  action: EditDocumentAction,
  resource: DocumentResource | undefined,
): {corrected: EditDocumentAction; strippedVersioning: boolean} {
  const changes = getEditActionCorrections(action, resource)
  const strippedVersioning = changes.perspective || changes.variant
  if (!strippedVersioning && !changes.liveEdit) {
    return {corrected: action, strippedVersioning: false}
  }

  const corrected: EditDocumentAction = {
    ...action,
    ...(changes.liveEdit && {liveEdit: true}),
    ...(changes.perspective && {perspective: undefined}),
    ...(changes.variant && {variant: undefined}),
  }
  // ensure we're using the right document ID for the corrected model
  corrected.documentId = getEffectiveDocumentId({
    ...corrected,
    documentId: getPublishedId(DocumentId(corrected.documentId)),
  })

  return {corrected, strippedVersioning}
}

/** Which fields of an edit action the resource's editing model requires changing. */
function getEditActionCorrections(
  action: EditDocumentAction,
  resource: DocumentResource | undefined,
): {liveEdit: boolean; perspective: boolean; variant: boolean} {
  const {liveEdit: forcedLiveEdit, supportsReleases} = getEffectiveDocumentModel(
    resource,
    action.documentType,
  )
  return {
    liveEdit: forcedLiveEdit === true && !action.liveEdit,
    perspective: isReleasePerspective(action.perspective) && !supportsReleases,
    variant: action.variant !== undefined && !supportsReleases,
  }
}

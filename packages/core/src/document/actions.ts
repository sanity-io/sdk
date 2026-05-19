import {type ReleaseDocument} from '@sanity/client'
import {SanityEncoder} from '@sanity/mutate'
import {type PatchMutation as SanityMutatePatchMutation} from '@sanity/mutate/_unstable_store'
import {type PatchMutation, type PatchOperations} from '@sanity/types'
import {type SanityDocument} from 'groq'

import {
  type DocumentHandle,
  type DocumentTypeHandle,
  type ReleaseHandle,
} from '../config/sanityConfig'
import {getEffectiveDocumentId} from './util'

const isSanityMutatePatch = (value: unknown): value is SanityMutatePatchMutation => {
  if (typeof value !== 'object' || !value) return false
  if (!('type' in value) || typeof value.type !== 'string' || value.type !== 'patch') return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('patches' in value) || !Array.isArray(value.patches)) return false
  return true
}

/**
 * Represents an action to create a new document.
 * Specifies the document type and optionally a document ID (which will be treated as the published ID).
 * @beta
 */
export interface CreateDocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  type: 'document.create'
  /**
   * Optional initial field values for the document.
   * These values will be set when the document is created.
   * System fields (_id, _type, _rev, _createdAt, _updatedAt) are omitted as they are set automatically.
   */
  initialValue?: Partial<
    Omit<
      SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>,
      '_id' | '_type' | '_rev' | '_createdAt' | '_updatedAt'
    >
  >
}

/**
 * Represents an action to delete an existing document.
 * Requires the full document handle including the document ID.
 * @beta
 */
export interface DeleteDocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  type: 'document.delete'
}

/**
 * Represents an action to edit an existing document using patches.
 * Requires the full document handle and an array of patch operations.
 * @beta
 */
export interface EditDocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  type: 'document.edit'
  patches?: PatchOperations[]
}

/**
 * Represents an action to publish the draft version of a document.
 * Requires the full document handle.
 * @beta
 */
export interface PublishDocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  type: 'document.publish'
}

/**
 * Represents an action to unpublish a document, moving its published content to a draft.
 * Requires the full document handle.
 * @beta
 */
export interface UnpublishDocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  type: 'document.unpublish'
}

/**
 * Represents an action to discard the draft changes of a document.
 * Requires the full document handle.
 * @beta
 */
export interface DiscardDocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  type: 'document.discard'
}

/**
 * Union type representing all possible document actions within the SDK.
 * @beta
 */
export type DocumentAction<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> =
  | CreateDocumentAction<TDocumentType, TDataset, TProjectId>
  | DeleteDocumentAction<TDocumentType, TDataset, TProjectId>
  | EditDocumentAction<TDocumentType, TDataset, TProjectId>
  | PublishDocumentAction<TDocumentType, TDataset, TProjectId>
  | UnpublishDocumentAction<TDocumentType, TDataset, TProjectId>
  | DiscardDocumentAction<TDocumentType, TDataset, TProjectId>

/**
 * Union of every action accepted by `applyDocumentActions` — both document-
 * level actions and release-lifecycle actions.
 * @beta
 */
export type Action<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> = DocumentAction<TDocumentType, TDataset, TProjectId> | ReleaseAction

/**
 * Creates a `CreateDocumentAction` object.
 * @param doc - A handle identifying the document type, dataset, and project. An optional `documentId` can be provided.
 * @param initialValue - Optional initial field values for the document. (System fields are omitted as they are set automatically.)
 * @returns A `CreateDocumentAction` object ready for dispatch.
 * @beta
 */
export function createDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentTypeHandle<TDocumentType, TDataset, TProjectId>,
  initialValue?: Partial<
    Omit<
      SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>,
      '_id' | '_type' | '_rev' | '_createdAt' | '_updatedAt'
    >
  >,
): CreateDocumentAction<TDocumentType, TDataset, TProjectId> {
  // users may pass in an explicit documentId -- make sure we format it correctly for the action
  let effectiveDocumentId
  if (typeof doc.documentId === 'string') {
    effectiveDocumentId = getEffectiveDocumentId({...doc, documentId: doc.documentId})
  }
  return {
    type: 'document.create',
    ...doc,
    ...(effectiveDocumentId && {documentId: effectiveDocumentId}),
    ...(initialValue && {initialValue}),
  }
}

/**
 * Creates a `DeleteDocumentAction` object.
 * @param doc - A handle uniquely identifying the document to be deleted.
 * @returns A `DeleteDocumentAction` object ready for dispatch.
 * @beta
 */
export function deleteDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): DeleteDocumentAction<TDocumentType, TDataset, TProjectId> {
  const effectiveDocumentId = getEffectiveDocumentId(doc)
  return {
    type: 'document.delete',
    ...doc,
    documentId: effectiveDocumentId,
  }
}

function convertSanityMutatePatch(
  sanityPatchMutation: SanityMutatePatchMutation,
): EditDocumentAction['patches'] {
  const encoded = SanityEncoder.encode(sanityPatchMutation) as PatchMutation[]
  return encoded.map((i) => {
    const copy: PatchOperations = {...i.patch}
    if ('id' in copy) delete copy.id
    return copy
  })
}

/**
 * Creates an `EditDocumentAction` object with patches for modifying a document.
 * Accepts patches in either the standard `PatchOperations` format or as a `SanityMutatePatchMutation` from `@sanity/mutate`.
 *
 * @param doc - A handle uniquely identifying the document to be edited.
 * @param sanityMutatePatch - A patch mutation object from `@sanity/mutate`.
 * @returns An `EditDocumentAction` object ready for dispatch.
 * @beta
 */
export function editDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
  sanityMutatePatch: SanityMutatePatchMutation,
): EditDocumentAction<TDocumentType, TDataset, TProjectId>
/**
 * Creates an `EditDocumentAction` object with patches for modifying a document.
 *
 * @param doc - A handle uniquely identifying the document to be edited.
 * @param patches - A single patch operation or an array of patch operations.
 * @returns An `EditDocumentAction` object ready for dispatch.
 * @beta
 */
export function editDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
  patches?: PatchOperations | PatchOperations[],
): EditDocumentAction<TDocumentType, TDataset, TProjectId>
/**
 * Creates an `EditDocumentAction` object with patches for modifying a document.
 * This is the implementation signature and handles the different patch input types.
 *
 * @param doc - A handle uniquely identifying the document to be edited.
 * @param patches - Patches in various formats (`PatchOperations`, `PatchOperations[]`, or `SanityMutatePatchMutation`).
 * @returns An `EditDocumentAction` object ready for dispatch.
 */
export function editDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
  patches?: PatchOperations | PatchOperations[] | SanityMutatePatchMutation,
): EditDocumentAction<TDocumentType, TDataset, TProjectId> {
  const effectiveDocumentId = getEffectiveDocumentId(doc)

  if (isSanityMutatePatch(patches)) {
    const converted = convertSanityMutatePatch(patches) ?? []
    return {
      ...doc,
      type: 'document.edit',
      documentId: effectiveDocumentId,
      patches: converted,
    }
  }

  return {
    ...doc,
    type: 'document.edit',
    documentId: effectiveDocumentId,
    ...(patches && {patches: Array.isArray(patches) ? patches : [patches]}),
  }
}

/**
 * Creates a `PublishDocumentAction` object.
 * @param doc - A handle uniquely identifying the document to be published.
 * @returns A `PublishDocumentAction` object ready for dispatch.
 * @beta
 */
export function publishDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): PublishDocumentAction<TDocumentType, TDataset, TProjectId> {
  const effectiveDocumentId = getEffectiveDocumentId(doc)
  return {
    type: 'document.publish',
    ...doc,
    documentId: effectiveDocumentId,
  }
}

/**
 * Creates an `UnpublishDocumentAction` object.
 * @param doc - A handle uniquely identifying the document to be unpublished.
 * @returns An `UnpublishDocumentAction` object ready for dispatch.
 * @beta
 */
export function unpublishDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): UnpublishDocumentAction<TDocumentType, TDataset, TProjectId> {
  const effectiveDocumentId = getEffectiveDocumentId(doc)
  return {
    type: 'document.unpublish',
    ...doc,
    documentId: effectiveDocumentId,
  }
}

/**
 * Creates a `DiscardDocumentAction` object.
 * @param doc - A handle uniquely identifying the document whose draft changes are to be discarded.
 * @returns A `DiscardDocumentAction` object ready for dispatch.
 * @beta
 */
export function discardDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): DiscardDocumentAction<TDocumentType, TDataset, TProjectId> {
  const effectiveDocumentId = getEffectiveDocumentId(doc)
  return {
    type: 'document.discard',
    ...doc,
    documentId: effectiveDocumentId,
  }
}

/**
 * Creates a new release. The `releaseId` must be unique within the current
 * retention period.
 * @beta
 */
export interface CreateReleaseAction extends ReleaseHandle {
  type: 'release.create'
  metadata: ReleaseDocument['metadata']
}

/**
 * Patches the metadata of an existing release.
 * @beta
 */
export interface EditReleaseAction extends ReleaseHandle {
  type: 'release.edit'
  patch: PatchOperations
}

/**
 * Publishes all version documents in a release.
 * @beta
 */
export interface PublishReleaseAction extends ReleaseHandle {
  type: 'release.publish'
}

/**
 * Schedules a release to be published at the given UTC time. Locks the
 * version documents server-side until the release is unscheduled or published.
 * @beta
 */
export interface ScheduleReleaseAction extends ReleaseHandle {
  type: 'release.schedule'
  publishAt: string
}

/**
 * Unschedules a release that was previously scheduled, returning it to the
 * active editable state.
 * @beta
 */
export interface UnscheduleReleaseAction extends ReleaseHandle {
  type: 'release.unschedule'
}

/**
 * Archives an active release. Version documents within the release are
 * removed and no longer queryable, though still recoverable through history
 * during the retention period.
 * @beta
 */
export interface ArchiveReleaseAction extends ReleaseHandle {
  type: 'release.archive'
}

/**
 * Restores an archived release. Only possible during the retention period.
 * @beta
 */
export interface UnarchiveReleaseAction extends ReleaseHandle {
  type: 'release.unarchive'
}

/**
 * Permanently deletes an archived or published release. To remove an active
 * release, use the archive action first.
 * @beta
 */
export interface DeleteReleaseAction extends ReleaseHandle {
  type: 'release.delete'
}

/**
 * Union of all release actions that can be dispatched alongside document
 * actions through `applyDocumentActions`.
 * @beta
 */
export type ReleaseAction =
  | CreateReleaseAction
  | EditReleaseAction
  | PublishReleaseAction
  | ScheduleReleaseAction
  | UnscheduleReleaseAction
  | ArchiveReleaseAction
  | UnarchiveReleaseAction
  | DeleteReleaseAction

/** @beta */
export function createRelease(
  handle: ReleaseHandle,
  metadata: ReleaseDocument['metadata'] = {releaseType: 'undecided'},
): CreateReleaseAction {
  return {type: 'release.create', ...handle, metadata}
}

/** @beta */
export function editRelease(handle: ReleaseHandle, patch: PatchOperations): EditReleaseAction {
  return {type: 'release.edit', ...handle, patch}
}

/** @beta */
export function publishRelease(handle: ReleaseHandle): PublishReleaseAction {
  return {type: 'release.publish', ...handle}
}

/** @beta */
export function scheduleRelease(handle: ReleaseHandle, publishAt: string): ScheduleReleaseAction {
  return {type: 'release.schedule', ...handle, publishAt}
}

/** @beta */
export function unscheduleRelease(handle: ReleaseHandle): UnscheduleReleaseAction {
  return {type: 'release.unschedule', ...handle}
}

/** @beta */
export function archiveRelease(handle: ReleaseHandle): ArchiveReleaseAction {
  return {type: 'release.archive', ...handle}
}

/** @beta */
export function unarchiveRelease(handle: ReleaseHandle): UnarchiveReleaseAction {
  return {type: 'release.unarchive', ...handle}
}

/** @beta */
export function deleteRelease(handle: ReleaseHandle): DeleteReleaseAction {
  return {type: 'release.delete', ...handle}
}

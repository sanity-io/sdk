import {SanityEncoder} from '@sanity/mutate'
import {type PatchMutation as SanityMutatePatchMutation} from '@sanity/mutate/_unstable_store'
import {type PatchMutation, type PatchOperations} from '@sanity/types'

import {type DocumentHandle, type DocumentTypeHandle} from '../config/sanityConfig'
import {getPublishedId} from '../utils/ids'

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
 * Creates a `CreateDocumentAction` object.
 * @param doc - A handle identifying the document type, dataset, and project. An optional `documentId` can be provided.
 * @returns A `CreateDocumentAction` object ready for dispatch.
 * @beta
 */
export function createDocument<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  doc: DocumentTypeHandle<TDocumentType, TDataset, TProjectId>,
): CreateDocumentAction<TDocumentType, TDataset, TProjectId> {
  return {
    type: 'document.create',
    ...doc,
    ...(doc.documentId && {documentId: getPublishedId(doc.documentId)}),
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
  return {
    type: 'document.delete',
    ...doc,
    documentId: getPublishedId(doc.documentId),
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
  if (isSanityMutatePatch(patches)) {
    const converted = convertSanityMutatePatch(patches) ?? []
    return {
      ...doc,
      type: 'document.edit',
      documentId: getPublishedId(doc.documentId),
      patches: converted,
    }
  }

  return {
    ...doc,
    type: 'document.edit',
    documentId: getPublishedId(doc.documentId),
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
  return {
    type: 'document.publish',
    ...doc,
    documentId: getPublishedId(doc.documentId),
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
  return {
    type: 'document.unpublish',
    ...doc,
    documentId: getPublishedId(doc.documentId),
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
  return {
    type: 'document.discard',
    ...doc,
    documentId: getPublishedId(doc.documentId),
  }
}

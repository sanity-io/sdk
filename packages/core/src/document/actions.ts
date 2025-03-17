import {SanityEncoder} from '@sanity/mutate'
import {type PatchMutation as SanityMutatePatchMutation} from '@sanity/mutate/_unstable_store'
import {type PatchMutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'

import {getPublishedId} from '../utils/ids'
import {
  type DocumentHandle,
  type DocumentResourceId,
  type DocumentTypeHandle,
} from './patchOperations'

const isSanityMutatePatch = (value: unknown): value is SanityMutatePatchMutation => {
  if (typeof value !== 'object' || !value) return false
  if (!('type' in value) || typeof value.type !== 'string' || value.type !== 'patch') return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('patches' in value) || !Array.isArray(value.patches)) return false
  return true
}

/** @public */
export interface CreateDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.create'
  documentId?: string
  resourceId?: DocumentResourceId
  documentType: TDocument['_type']
}

// the unused `_TDocument` is primarily for typescript meta-programming to
// capture and preserve the document type as best as possible
/** @public */
export interface DeleteDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.delete'
  documentId: string
  resourceId?: DocumentResourceId
}

/** @public */
export interface EditDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.edit'
  documentId: string
  resourceId?: DocumentResourceId
  patches?: PatchOperations[]
}

/** @public */
export interface PublishDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.publish'
  documentId: string
  resourceId?: DocumentResourceId
}

/** @public */
export interface UnpublishDocumentAction<
  _TDocument extends SanityDocumentLike = SanityDocumentLike,
> {
  type: 'document.unpublish'
  documentId: string
  resourceId?: DocumentResourceId
}

/** @public */
export interface DiscardDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.discard'
  documentId: string
  resourceId?: DocumentResourceId
}

/** @public */
export type DocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike> =
  | CreateDocumentAction<TDocument>
  | DeleteDocumentAction<TDocument>
  | EditDocumentAction<TDocument>
  | PublishDocumentAction<TDocument>
  | UnpublishDocumentAction<TDocument>
  | DiscardDocumentAction<TDocument>

/** @public */
export function createDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentTypeHandle<TDocument> | DocumentHandle<TDocument>,
): CreateDocumentAction<TDocument> {
  return {
    type: 'document.create',
    ...(doc._id && {documentId: doc._id}),
    documentType: doc._type,
    ...(doc.resourceId && {resourceId: doc.resourceId}),
  }
}

/** @public */
export function deleteDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): DeleteDocumentAction<TDocument> {
  return {
    type: 'document.delete',
    documentId: getPublishedId(doc._id),
    ...(doc.resourceId && {resourceId: doc.resourceId}),
  }
}

function convertSanityMutatePatch(
  sanityPatchMutation: SanityMutatePatchMutation,
): EditDocumentAction {
  const encoded = SanityEncoder.encode(sanityPatchMutation) as PatchMutation[]

  return {
    documentId: sanityPatchMutation.id,
    type: 'document.edit',
    patches: encoded.map((i) => {
      const copy: PatchOperations = {...i.patch}
      if ('id' in copy) delete copy.id
      return copy
    }),
  }
}

/** @public */
export function editDocument<TDocument extends SanityDocumentLike>(
  sanityMutatePatch: SanityMutatePatchMutation,
): EditDocumentAction<TDocument>
/** @public */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
  patches?: PatchOperations | PatchOperations[],
): EditDocumentAction<TDocument>
/** @public */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: SanityMutatePatchMutation | DocumentHandle<TDocument>,
  patches?: PatchOperations | PatchOperations[],
): EditDocumentAction<TDocument> {
  if (isSanityMutatePatch(doc)) return convertSanityMutatePatch(doc)

  return {
    type: 'document.edit',
    documentId: getPublishedId(doc._id),
    ...(patches && {patches: Array.isArray(patches) ? patches : [patches]}),
    ...(doc.resourceId && {resourceId: doc.resourceId}),
  }
}

/** @public */
export function publishDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): PublishDocumentAction<TDocument> {
  return {
    type: 'document.publish',
    documentId: getPublishedId(doc._id),
    ...(doc.resourceId && {resourceId: doc.resourceId}),
  }
}

/** @public */
export function unpublishDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): UnpublishDocumentAction<TDocument> {
  return {
    type: 'document.unpublish',
    documentId: getPublishedId(doc._id),
    ...(doc.resourceId && {resourceId: doc.resourceId}),
  }
}

/** @public */
export function discardDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): DiscardDocumentAction<TDocument> {
  return {
    type: 'document.discard',
    documentId: getPublishedId(doc._id),
    ...(doc.resourceId && {resourceId: doc.resourceId}),
  }
}

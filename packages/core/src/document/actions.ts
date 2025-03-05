import {SanityEncoder} from '@sanity/mutate'
import {type PatchMutation as SanityMutatePatchMutation} from '@sanity/mutate/_unstable_store'
import {type PatchMutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'

import {getPublishedId} from '../utils/ids'
import {type DatasetResourceId} from './documentStore'
import {type DocumentHandle, type DocumentTypeHandle} from './patchOperations'

const isSanityMutatePatch = (value: unknown): value is SanityMutatePatchMutation => {
  if (typeof value !== 'object' || !value) return false
  if (!('type' in value) || typeof value.type !== 'string' || value.type !== 'patch') return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('patches' in value) || !Array.isArray(value.patches)) return false
  return true
}

/** @beta */
export interface CreateDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.create'
  documentId?: string
  documentType: TDocument['_type']
  datasetResourceId: DatasetResourceId
}

// the unused `_TDocument` is primarily for typescript meta-programming to
// capture and preserve the document type as best as possible
/** @beta */
export interface DeleteDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.delete'
  documentId: string
  datasetResourceId: DatasetResourceId
}

/** @beta */
export interface EditDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.edit'
  documentId: string
  datasetResourceId: DatasetResourceId
  patches?: PatchOperations[]
}

/** @beta */
export interface PublishDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.publish'
  documentId: string
  datasetResourceId: DatasetResourceId
}

/** @beta */
export interface UnpublishDocumentAction<
  _TDocument extends SanityDocumentLike = SanityDocumentLike,
> {
  type: 'document.unpublish'
  documentId: string
  datasetResourceId: DatasetResourceId
}

/** @beta */
export interface DiscardDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.discard'
  documentId: string
  datasetResourceId: DatasetResourceId
}

/** @beta */
export type DocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike> =
  | CreateDocumentAction<TDocument>
  | DeleteDocumentAction<TDocument>
  | EditDocumentAction<TDocument>
  | PublishDocumentAction<TDocument>
  | UnpublishDocumentAction<TDocument>
  | DiscardDocumentAction<TDocument>

/** @beta */
export function createDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentTypeHandle<TDocument> | DocumentHandle<TDocument>,
): CreateDocumentAction<TDocument> {
  return {
    type: 'document.create',
    ...(doc._id && {documentId: doc._id}),
    documentType: doc._type,
    datasetResourceId: doc.datasetResourceId,
  }
}

/** @beta */
export function deleteDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): DeleteDocumentAction<TDocument> {
  return {
    type: 'document.delete',
    documentId: getPublishedId(doc._id),
    datasetResourceId: doc.datasetResourceId,
  }
}

function convertSanityMutatePatch(
  sanityPatchMutation: SanityMutatePatchMutation,
  datasetResourceId: DatasetResourceId,
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
    datasetResourceId,
  }
}

/** @beta */
export function editDocument<TDocument extends SanityDocumentLike>(
  sanityMutatePatch: SanityMutatePatchMutation,
  datasetResourceId: DatasetResourceId,
): EditDocumentAction<TDocument>
/** @beta */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
  datasetResourceId?: DatasetResourceId,
  patches?: PatchOperations | PatchOperations[],
): EditDocumentAction<TDocument>
/** @beta */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: SanityMutatePatchMutation | DocumentHandle<TDocument>,
  datasetResourceId?: DatasetResourceId,
  patches?: PatchOperations | PatchOperations[],
): EditDocumentAction<TDocument> {
  if (isSanityMutatePatch(doc)) return convertSanityMutatePatch(doc, datasetResourceId!)

  return {
    type: 'document.edit',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
    datasetResourceId: doc.datasetResourceId,
    ...(patches && {patches: Array.isArray(patches) ? patches : [patches]}),
  }
}

/** @beta */
export function publishDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): PublishDocumentAction<TDocument> {
  return {
    type: 'document.publish',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
    datasetResourceId: doc.datasetResourceId,
  }
}

/** @beta */
export function unpublishDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): UnpublishDocumentAction<TDocument> {
  return {
    type: 'document.unpublish',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
    datasetResourceId: doc.datasetResourceId,
  }
}

/** @beta */
export function discardDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): DiscardDocumentAction<TDocument> {
  return {
    type: 'document.discard',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
    datasetResourceId: doc.datasetResourceId,
  }
}

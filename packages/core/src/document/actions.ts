import {type PatchOperations, type SanityDocumentLike} from '@sanity/types'

import {getPublishedId} from '../preview/util'
import {type DocumentHandle, type DocumentTypeHandle} from './patchOperations'
import {getId} from './processMutations'

export interface CreateDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.create'
  documentId: string
  documentType: TDocument['_type']
}

// the unused `_TDocument` is primarily for typescript meta-programming to
// capture and preserve the document type as best as possible
export interface DeleteDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.delete'
  documentId: string
}

export interface EditDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.edit'
  documentId: string
  patch: PatchOperations
}

export interface PublishDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.publish'
  documentId: string
}

export interface UnpublishDocumentAction<
  _TDocument extends SanityDocumentLike = SanityDocumentLike,
> {
  type: 'document.unpublish'
  documentId: string
}

export interface DiscardDocumentAction<_TDocument extends SanityDocumentLike = SanityDocumentLike> {
  type: 'document.discard'
  documentId: string
}

export type DocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike> =
  | CreateDocumentAction<TDocument>
  | DeleteDocumentAction<TDocument>
  | EditDocumentAction<TDocument>
  | PublishDocumentAction<TDocument>
  | UnpublishDocumentAction<TDocument>
  | DiscardDocumentAction<TDocument>

export function createDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentTypeHandle<TDocument> | DocumentHandle<TDocument>,
): CreateDocumentAction<TDocument> {
  return {
    type: 'document.create',
    documentId: getId(doc._id) ?? getId(),
    documentType: doc._type,
  }
}

export function deleteDocument<TDocument extends SanityDocumentLike>(
  doc: string | DocumentHandle<TDocument>,
): DeleteDocumentAction<TDocument> {
  return {
    type: 'document.delete',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
  }
}

export function editDocument<TDocument extends SanityDocumentLike>(
  doc: string | DocumentHandle<TDocument>,
  patch: PatchOperations,
): EditDocumentAction<TDocument> {
  return {
    type: 'document.edit',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
    patch,
  }
}

export function publishDocument<TDocument extends SanityDocumentLike>(
  doc: string | DocumentHandle<TDocument>,
): PublishDocumentAction<TDocument> {
  return {
    type: 'document.publish',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
  }
}

export function unpublishDocument<TDocument extends SanityDocumentLike>(
  doc: string | DocumentHandle<TDocument>,
): UnpublishDocumentAction<TDocument> {
  return {
    type: 'document.unpublish',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
  }
}

export function discardDocument<TDocument extends SanityDocumentLike>(
  doc: string | DocumentHandle<TDocument>,
): DiscardDocumentAction<TDocument> {
  return {
    type: 'document.discard',
    documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
  }
}

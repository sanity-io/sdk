import {type PatchOperations} from '@sanity/types'

import {getPublishedId} from '../preview/util'
import {type DocumentHandle} from './patchOperations'
import {getId} from './processMutations'

export interface CreateDocumentAction {
  type: 'document.create'
  documentId: string
  // TODO: should this support templates and params?
  documentType: string
}

export interface DeleteDocumentAction {
  type: 'document.delete'
  documentId: string
}

export interface EditDocumentAction {
  type: 'document.edit'
  documentId: string
  patch: PatchOperations
}

export interface PublishDocumentAction {
  type: 'document.publish'
  documentId: string
}

export interface UnpublishDocumentAction {
  type: 'document.unpublish'
  documentId: string
}

export interface DiscardDocumentAction {
  type: 'document.discard'
  documentId: string
}

export type DocumentAction =
  | CreateDocumentAction
  | DeleteDocumentAction
  | EditDocumentAction
  | PublishDocumentAction
  | UnpublishDocumentAction
  | DiscardDocumentAction

export const createDocument = (
  input: string | {_id?: string; _type: string},
): CreateDocumentAction => ({
  type: 'document.create',
  documentId: getPublishedId(typeof input === 'object' ? getId(input._id) : getId()),
  documentType: typeof input === 'object' ? input._type : input,
})

export const deleteDocument = (doc: string | DocumentHandle): DeleteDocumentAction => ({
  type: 'document.delete',
  documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
})

export const editDocument = (
  doc: string | DocumentHandle,
  patch: PatchOperations,
): EditDocumentAction => ({
  type: 'document.edit',
  documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
  patch,
})

export const publishDocument = (doc: string | DocumentHandle): PublishDocumentAction => ({
  type: 'document.publish',
  documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
})

export const unpublishDocument = (doc: string | DocumentHandle): UnpublishDocumentAction => ({
  type: 'document.unpublish',
  documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
})

export const discardDocument = (doc: string | DocumentHandle): DiscardDocumentAction => ({
  type: 'document.discard',
  documentId: getPublishedId(typeof doc === 'string' ? doc : doc._id),
})

import {type PatchOperations} from '@sanity/types'

import {type DocumentHandle} from '../documentList/documentListStore'
import {getPublishedId} from '../preview/util'
import {getId} from './applyMutations'

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

export const createDocument = (input: string | DocumentHandle): CreateDocumentAction => ({
  type: 'document.create',
  documentId: getPublishedId(typeof input === 'object' ? getId(input._id) : getId(input)),
  documentType: typeof input === 'object' ? input._type : input,
})

export const deleteDocument = (documentId: string): DeleteDocumentAction => ({
  type: 'document.delete',
  documentId: getPublishedId(documentId),
})

export const editDocument = (documentId: string, patch: PatchOperations): EditDocumentAction => ({
  type: 'document.edit',
  documentId: getPublishedId(documentId),
  patch,
})

export const publishDocument = (documentId: string): PublishDocumentAction => ({
  type: 'document.publish',
  documentId: getPublishedId(documentId),
})

export const unpublishDocument = (documentId: string): UnpublishDocumentAction => ({
  type: 'document.unpublish',
  documentId: getPublishedId(documentId),
})

export const discardDocument = (documentId: string): DiscardDocumentAction => ({
  type: 'document.discard',
  documentId: getPublishedId(documentId),
})

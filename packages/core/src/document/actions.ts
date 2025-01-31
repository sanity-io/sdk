/* eslint-disable tsdoc/syntax */
import {type PatchOperations} from '@sanity/types'

import {type DocumentHandle} from '../documentList/documentListStore'
import {getPublishedId} from '../preview/util'

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

/**
 * Implements ID generation:
 *
 * > A create mutation creates a new document. It takes the literal document
 * > content as its argument. The rules for the new document's identifier are as
 * > follows:
 * >
 * > - If the `_id` attribute is missing, then a new, random, unique ID is
 * >   generated.
 * > - If the `_id` attribute is present but ends with `.`, then it is used as a
 * >   prefix for a new, random, unique ID.
 * > - If the _id attribute is present, it is used as-is.
 * >
 * > [- source](https://www.sanity.io/docs/http-mutations#c732f27330a4)
 */
function getId(id?: string) {
  if (typeof id !== 'string') return crypto.randomUUID()
  //
  if (id.endsWith('.')) return `${id}${crypto.randomUUID()}`
  return id
}

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

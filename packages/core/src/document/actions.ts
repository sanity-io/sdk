import {SanityEncoder} from '@sanity/mutate'
import {type PatchMutation as SanityMutatePatchMutation} from '@sanity/mutate/_unstable_store'
import {type PatchMutation, type PatchOperations, type SanityDocumentLike} from '@sanity/types'

import {type DocumentHandle, type DocumentTypeHandle} from '../config/sanityConfig'
import {getPublishedId} from '../utils/ids'

const isSanityMutatePatch = (value: unknown): value is SanityMutatePatchMutation => {
  if (typeof value !== 'object' || !value) return false
  if (!('type' in value) || typeof value.type !== 'string' || value.type !== 'patch') return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('patches' in value) || !Array.isArray(value.patches)) return false
  return true
}

/** @beta */
export interface CreateDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentTypeHandle<TDocument> {
  type: 'document.create'
}

/** @beta */
export interface DeleteDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentHandle<TDocument> {
  type: 'document.delete'
}

/** @beta */
export interface EditDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentHandle<TDocument> {
  type: 'document.edit'
  patches?: PatchOperations[]
}

/** @beta */
export interface PublishDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentHandle<TDocument> {
  type: 'document.publish'
}

/** @beta */
export interface UnpublishDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentHandle<TDocument> {
  type: 'document.unpublish'
}

/** @beta */
export interface DiscardDocumentAction<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentHandle<TDocument> {
  type: 'document.discard'
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
  doc: DocumentTypeHandle<TDocument>,
): CreateDocumentAction<TDocument> {
  return {
    type: 'document.create',
    ...doc,
    ...(doc.documentId && {documentId: getPublishedId(doc.documentId)}),
  }
}

/** @beta */
export function deleteDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): DeleteDocumentAction<TDocument> {
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

/** @beta */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
  sanityMutatePatch: SanityMutatePatchMutation,
): EditDocumentAction<TDocument>
/** @beta */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
  patches?: PatchOperations | PatchOperations[],
): EditDocumentAction<TDocument>
/** @beta */
export function editDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
  patches?: PatchOperations | PatchOperations[] | SanityMutatePatchMutation,
): EditDocumentAction<TDocument> {
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

/** @beta */
export function publishDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): PublishDocumentAction<TDocument> {
  return {
    type: 'document.publish',
    ...doc,
    documentId: getPublishedId(doc.documentId),
  }
}

/** @beta */
export function unpublishDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): UnpublishDocumentAction<TDocument> {
  return {
    type: 'document.unpublish',
    ...doc,
    documentId: getPublishedId(doc.documentId),
  }
}

/** @beta */
export function discardDocument<TDocument extends SanityDocumentLike>(
  doc: DocumentHandle<TDocument>,
): DiscardDocumentAction<TDocument> {
  return {
    type: 'document.discard',
    ...doc,
    documentId: getPublishedId(doc.documentId),
  }
}

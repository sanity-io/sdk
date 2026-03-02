import {type DocumentHandle, type DocumentTypeHandle, type ResourceHandle} from './sanityConfig'

/**
 * Creates or validates a `DocumentHandle` object.
 * Ensures the provided object conforms to the `DocumentHandle` interface.
 * @param handle - The object containing document identification properties.
 * @returns The validated `DocumentHandle` object.
 * @public
 */
export function createDocumentHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  handle: DocumentHandle<TDocumentType, TDataset, TProjectId>,
): DocumentHandle<TDocumentType, TDataset, TProjectId> {
  return handle
}

/**
 * Creates or validates a `DocumentTypeHandle` object.
 * Ensures the provided object conforms to the `DocumentTypeHandle` interface.
 * @param handle - The object containing document type identification properties.
 * @returns The validated `DocumentTypeHandle` object.
 * @public
 */
export function createDocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  handle: DocumentTypeHandle<TDocumentType, TDataset, TProjectId>,
): DocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  return handle
}

/**
 * Creates or validates a `ResourceHandle` object.
 * Ensures the provided object conforms to the `ResourceHandle` interface.
 * @param handle - The object containing resource identification properties.
 * @returns The validated `ResourceHandle` object.
 * @public
 */
export function createResourceHandle<
  TDataset extends string = string,
  TProjectId extends string = string,
>(handle: ResourceHandle<TProjectId, TDataset>): ResourceHandle<TProjectId, TDataset> {
  return handle
}

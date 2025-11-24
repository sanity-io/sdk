import {
  type DatasetHandle,
  type DocumentHandle,
  type DocumentTypeHandle,
  type ProjectHandle,
} from './sanityConfig'

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
 * Creates or validates a `ProjectHandle` object.
 * Ensures the provided object conforms to the `ProjectHandle` interface.
 * @param handle - The object containing project identification properties.
 * @returns The validated `ProjectHandle` object.
 * @public
 */
export function createProjectHandle<TProjectId extends string = string>(
  handle: ProjectHandle<TProjectId>,
): ProjectHandle<TProjectId> {
  return handle
}

/**
 * Creates or validates a `DatasetHandle` object.
 * Ensures the provided object conforms to the `DatasetHandle` interface.
 * @param handle - The object containing dataset identification properties.
 * @returns The validated `DatasetHandle` object.
 * @public
 */
export function createDatasetHandle<
  TDataset extends string = string,
  TProjectId extends string = string,
>(handle: DatasetHandle<TDataset, TProjectId>): DatasetHandle<TDataset, TProjectId> {
  return handle
}

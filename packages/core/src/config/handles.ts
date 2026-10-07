import {
  type DatasetHandle,
  type DocumentHandle,
  type DocumentTypeHandle,
  type ProjectHandle,
} from './sanityConfig'

/**
 * Creates or validates a `DocumentHandle` object.
 * Ensures the provided object conforms to the `DocumentHandle` interface.
 *
 * This signature applies when the handle passes both `projectId` and `dataset` as strings. The
 * returned handle keeps both fields required and typed as the values passed, so
 * `createDocumentHandle({projectId: 'abc123', dataset: 'production', ...}).projectId` is typed
 * `'abc123'` instead of `'abc123' | undefined`. A field typed `string | undefined`, such as one
 * spread from a `SanityConfig`, uses the next signature and stays optional.
 * @param handle - The object containing document identification properties.
 * @returns The validated `DocumentHandle` object, with `projectId` and `dataset` required.
 * @public
 */
export function createDocumentHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  handle: DocumentHandle<TDocumentType, TDataset, TProjectId> & {
    dataset: TDataset
    projectId: TProjectId
  },
): DocumentHandle<TDocumentType, TDataset, TProjectId> & {dataset: TDataset; projectId: TProjectId}

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
): DocumentHandle<TDocumentType, TDataset, TProjectId>

/** @public */
export function createDocumentHandle(handle: DocumentHandle): DocumentHandle {
  return handle
}

/**
 * Creates or validates a `DocumentTypeHandle` object.
 * Ensures the provided object conforms to the `DocumentTypeHandle` interface.
 *
 * This signature applies when the handle passes both `projectId` and `dataset` as strings. The
 * returned handle keeps both fields required and typed as the values passed.
 * @param handle - The object containing document type identification properties.
 * @returns The validated `DocumentTypeHandle` object, with `projectId` and `dataset` required.
 * @public
 */
export function createDocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  handle: DocumentTypeHandle<TDocumentType, TDataset, TProjectId> & {
    dataset: TDataset
    projectId: TProjectId
  },
): DocumentTypeHandle<TDocumentType, TDataset, TProjectId> & {
  dataset: TDataset
  projectId: TProjectId
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
): DocumentTypeHandle<TDocumentType, TDataset, TProjectId>

/** @public */
export function createDocumentTypeHandle(handle: DocumentTypeHandle): DocumentTypeHandle {
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
 *
 * This signature applies when the handle passes both `projectId` and `dataset` as strings. The
 * returned handle keeps both fields required and typed as the values passed.
 * @param handle - The object containing dataset identification properties.
 * @returns The validated `DatasetHandle` object, with `projectId` and `dataset` required.
 * @public
 */
export function createDatasetHandle<
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  handle: DatasetHandle<TDataset, TProjectId> & {dataset: TDataset; projectId: TProjectId},
): DatasetHandle<TDataset, TProjectId> & {dataset: TDataset; projectId: TProjectId}

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
>(handle: DatasetHandle<TDataset, TProjectId>): DatasetHandle<TDataset, TProjectId>

/** @public */
export function createDatasetHandle(handle: DatasetHandle): DatasetHandle {
  return handle
}

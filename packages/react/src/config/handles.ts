import {
  type DatasetHandle,
  type DocumentHandle as CoreDocumentHandle,
  type DocumentTypeHandle as CoreDocumentTypeHandle,
} from '@sanity/sdk'

/**
 * React SDK resource handle — extends the core DatasetHandle with `resourceName`
 * for context-based resource resolution.
 *
 * Use this (or its subtypes) as the options type for custom hooks that need to
 * accept a resource. It accepts a `resource` object, a `resourceName` registered
 * via the `resources` prop on `<SanityApp>`, or a bare `projectId`/`dataset` pair
 * for backward compatibility.
 *
 * @public
 */
export interface ResourceHandle<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  /**
   * Name of a resource registered via the `resources` prop on `<SanityApp>`.
   * Resolved to a `DocumentResource` at the React layer.
   */
  resourceName?: string
}

/**
 * React SDK document-type handle. Adds `resourceName` to the core `DocumentTypeHandle`.
 * @public
 */
export interface DocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends CoreDocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  resourceName?: string
}

/**
 * React SDK document handle. Adds `resourceName` to the core `DocumentHandle`.
 *
 * Import from `@sanity/sdk-react` (not `@sanity/sdk`) when writing option types
 * for hooks — this version understands `resourceName` resolution.
 *
 * @public
 */
export interface DocumentHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends CoreDocumentHandle<TDocumentType, TDataset, TProjectId> {
  resourceName?: string
}

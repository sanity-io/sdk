import {type ClientPerspective, type StackablePerspective} from '@sanity/client'

import {type AuthConfig} from './authConfig'

/**
 * Represents the minimal configuration required to identify a Sanity project.
 * @public
 */
export interface ProjectHandle<TProjectId extends string = string> {
  projectId?: TProjectId
}

/**
 * @public
 */
export type ReleasePerspective = {
  releaseName: string
  excludedPerspectives?: StackablePerspective[]
}

/**
 * @public
 */
export interface PerspectiveHandle {
  perspective?: ClientPerspective | ReleasePerspective
}

/**
 * @public
 */
export interface DatasetHandle<TDataset extends string = string, TProjectId extends string = string>
  extends ProjectHandle<TProjectId>, PerspectiveHandle {
  dataset?: TDataset
  /**
   * @beta
   * The name of the source to use for this operation.
   */
  sourceName?: string
  /**
   * @beta
   * Explicit source object to use for this operation.
   */
  source?: DocumentSource
}

/**
 * Identifies a specific document type within a Sanity dataset and project.
 * Includes `projectId`, `dataset`, and `documentType`.
 * Optionally includes a `documentId` and `liveEdit` flag.
 * @public
 */
export interface DocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  documentId?: string
  documentType: TDocumentType
  /**
   * Indicates whether this document uses liveEdit mode.
   * When `true`, the document does not use the draft/published model and edits are applied directly to the document.
   * @see https://www.sanity.io/docs/content-lake/drafts#ca0663a8f002
   */
  liveEdit?: boolean
}

/**
 * Uniquely identifies a specific document within a Sanity dataset and project.
 * Includes `projectId`, `dataset`, `documentType`, and the required `documentId`.
 * Commonly used by document-related hooks and components to reference a document without fetching its full content initially.
 * @public
 */
export interface DocumentHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  documentId: string
}

/**
 * Represents the complete configuration for a Sanity SDK instance
 * @public
 */
export interface SanityConfig extends DatasetHandle, PerspectiveHandle {
  /**
   * Authentication configuration for the instance
   * @remarks Merged with parent configurations when using createChild
   */
  auth?: AuthConfig
  /**
   * Studio mode configuration for use of the SDK in a Sanity Studio
   * @remarks Controls whether studio mode features are enabled
   */
  studioMode?: {
    enabled: boolean
  }

  /**
   * @beta
   * A list of named sources to use for this instance.
   */
  sources?: Record<string, DocumentSource>
}

/**
 * A document source can be used for querying.
 * This will soon be the default way to identify where you are querying from.
 *
 * @beta
 */
export type DocumentSource = DatasetSource | MediaLibrarySource | CanvasSource

/**
 * @beta
 */
export type DatasetSource = {projectId: string; dataset: string}

/**
 * @beta
 */
export type MediaLibrarySource = {mediaLibraryId: string}

/**
 * @beta
 */
export type CanvasSource = {canvasId: string}

/**
 * @beta
 */
export function isDatasetSource(source: DocumentSource): source is DatasetSource {
  return 'projectId' in source && 'dataset' in source
}

/**
 * @beta
 */
export function isMediaLibrarySource(source: DocumentSource): source is MediaLibrarySource {
  return 'mediaLibraryId' in source
}

/**
 * @beta
 */
export function isCanvasSource(source: DocumentSource): source is CanvasSource {
  return 'canvasId' in source
}

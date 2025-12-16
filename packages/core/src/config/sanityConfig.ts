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
  extends ProjectHandle<TProjectId>,
    PerspectiveHandle {
  dataset?: TDataset
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
export interface SanityConfig {
  /**
   * Authentication configuration for the instance
   */
  auth?: AuthConfig
  /**
   * Studio mode configuration for use of the SDK in a Sanity Studio
   * @remarks Controls whether studio mode features are enabled
   */
  studioMode?: {
    enabled: boolean
  }
}

/**
 * A document source can be used for querying.
 *
 * @beta
 */
export type DocumentSource = DatasetSource | MediaLibrarySource | CanvasSource

export type DatasetSource = {projectId: string; dataset: string}

export type MediaLibrarySource = {mediaLibraryId: string}

export type CanvasSource = {canvasId: string}

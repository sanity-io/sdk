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
 * Represents the configuration required to identify a Sanity media library.
 * @public
 */
export interface MediaLibraryHandle<TMediaLibraryId extends string = string>
  extends PerspectiveHandle {
  mediaLibraryId?: TMediaLibraryId
}

/**
 * Identifies a specific document type within a Sanity dataset and project.
 * Includes `projectId`, `dataset`, and `documentType`.
 * Optionally includes a `documentId`, useful for referencing a specific document type context, potentially without a specific document ID.
 * @public
 */
export interface DocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  documentId?: string
  documentType: TDocumentType
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
export interface SanityConfig extends DatasetHandle, PerspectiveHandle, MediaLibraryHandle {
  /**
   * Media library ID for media library queries
   * @remarks When provided, enables media library functionality
   */
  mediaLibraryId?: string
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
}

// /**
//  * Configuration for a Sanity SDK instance with dataset support
//  * @public
//  */
// export interface DatasetSanityConfig extends SanityConfig {}

// /**
//  * Configuration for a Sanity SDK instance with media library support
//  * @public
//  */
// export interface MediaLibrarySanityConfig extends SanityConfig {
//   mediaLibraryId: string
//   projectId?: never
//   dataset?: never
// }

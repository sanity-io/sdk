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
}

export const SOURCE_ID = '__sanity_internal_sourceId'

/**
 * A document source can be used for querying.
 *
 * @beta
 * @see datasetSource Construct a document source for a given projectId and dataset.
 * @see mediaLibrarySource Construct a document source for a mediaLibraryId.
 */
export type DocumentSource = {
  [SOURCE_ID]: ['media-library', string] | {projectId: string; dataset: string}
}

/**
 * Returns a document source for a projectId and dataset.
 *
 * @beta
 */
export function datasetSource(projectId: string, dataset: string): DocumentSource {
  return {[SOURCE_ID]: {projectId, dataset}}
}

/**
 * Returns a document source for a Media Library.
 *
 * @beta
 */
export function mediaLibrarySource(id: string): DocumentSource {
  return {[SOURCE_ID]: ['media-library', id]}
}
